package main

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"
	"time"
)

func requireWorkspaceID(t *testing.T, id string, err error) string {
	t.Helper()
	if err != nil || id == "" {
		t.Fatalf("expected a record ID: %v", err)
	}
	return id
}

func TestWorkspaceFamilyWorkflow(t *testing.T) {
	connection := os.Getenv("SHAADI_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("set SHAADI_TEST_DATABASE_URL to a dedicated test database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	store, err := openWorkspace(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	defer store.db.Close()
	prefix := "test:" + time.Now().UTC().Format(time.RFC3339Nano)
	newAccount := func(name string) string {
		id, err := store.syncAccount(ctx, prefix+":"+name, name)
		return requireWorkspaceID(t, id, err)
	}
	owner, brother, cousin, outsider := newAccount("Owner"), newAccount("Brother"), newAccount("Cousin"), newAccount("Outsider")
	var wedding, otherWedding string
	defer func() {
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		for _, id := range []string{wedding, otherWedding} {
			if id != "" {
				if _, err := store.db.ExecContext(cleanup, "DELETE FROM weddings WHERE id = $1", id); err != nil {
					t.Errorf("clean up test wedding: %v", err)
				}
			}
		}
		for _, id := range []string{owner, brother, cousin, outsider} {
			if _, err := store.db.ExecContext(cleanup, "DELETE FROM workspace_accounts WHERE id = $1", id); err != nil {
				t.Errorf("clean up test account: %v", err)
			}
		}
	}()
	wedding, err = store.createWedding(ctx, owner, "Sample wedding", "2027-02-15", "Asia/Kolkata")
	requireWorkspaceID(t, wedding, err)
	otherWedding, err = store.createWedding(ctx, outsider, "Other wedding", "2027-02-16", "Asia/Kolkata")
	requireWorkspaceID(t, otherWedding, err)
	person, err := store.addPerson(ctx, wedding, owner, "Brother")
	requireWorkspaceID(t, person, err)
	function, err := store.addFunction(ctx, wedding, owner, "Sangeet", "Grand Ballroom", time.Now())
	requireWorkspaceID(t, function, err)
	task, err := store.addTask(ctx, wedding, owner, workspaceTask{Title: "Sound check", Function: &function, Assignee: &person})
	requireWorkspaceID(t, task, err)
	if _, err := store.addTask(ctx, otherWedding, outsider, workspaceTask{Title: "Wrong wedding", Function: &function}); err == nil {
		t.Fatal("cross-wedding function reference was accepted")
	}
	shared, err := store.addTask(ctx, wedding, owner, workspaceTask{Title: "Arrange pickup", Claimable: true})
	requireWorkspaceID(t, shared, err)

	token, err := store.invite(ctx, wedding, owner, person, "family")
	requireWorkspaceID(t, token, err)
	if err := store.revokeInvite(ctx, wedding, owner, token); err != nil {
		t.Fatal(err)
	}
	if _, err := store.acceptInvite(ctx, brother, token); !errors.Is(err, errWorkspaceNotFound) {
		t.Fatalf("revoked invite accepted: %v", err)
	}
	token, err = store.invite(ctx, wedding, owner, person, "family")
	requireWorkspaceID(t, token, err)
	joined, err := store.acceptInvite(ctx, brother, token)
	if err != nil || joined != wedding {
		t.Fatalf("invite acceptance failed: %v", err)
	}
	if _, err := store.acceptInvite(ctx, outsider, token); !errors.Is(err, errWorkspaceNotFound) {
		t.Fatalf("consumed invite accepted: %v", err)
	}
	cousinPerson, err := store.addPerson(ctx, wedding, owner, "Cousin")
	requireWorkspaceID(t, cousinPerson, err)
	token, err = store.invite(ctx, wedding, owner, cousinPerson, "family")
	requireWorkspaceID(t, token, err)
	joined, err = store.acceptInvite(ctx, cousin, token)
	requireWorkspaceID(t, joined, err)

	tasks, err := store.listTasks(ctx, wedding, brother)
	if err != nil || len(tasks) != 2 {
		t.Fatalf("brother should see the pre-assigned task and the open task: %v, %v", tasks, err)
	}
	tasks, err = store.listTasks(ctx, wedding, cousin)
	if err != nil || len(tasks) != 1 || tasks[0].ID != shared {
		t.Fatalf("cousin should see only the open task: %v, %v", tasks, err)
	}
	tasks, err = store.listTasks(ctx, wedding, outsider)
	if err != nil || len(tasks) != 0 {
		t.Fatalf("outsider saw private tasks: %v, %v", tasks, err)
	}
	if _, err := store.setTaskDone(ctx, wedding, cousin, task, 1, true); !errors.Is(err, errWorkspaceNotFound) {
		t.Fatalf("family member edited someone else's task: %v", err)
	}
	if next, err := store.setTaskDone(ctx, wedding, brother, task, 1, true); err != nil || next != 2 {
		t.Fatalf("task completion failed: %d, %v", next, err)
	}
	if next, err := store.setTaskDone(ctx, wedding, owner, task, 1, false); !errors.Is(err, errWorkspaceConflict) || next != 2 {
		t.Fatalf("stale edit was accepted: %d, %v", next, err)
	}

	type result struct {
		assignee string
		err      error
	}
	results := make(chan result, 2)
	start := make(chan struct{})
	var group sync.WaitGroup
	for _, actor := range []string{brother, cousin} {
		group.Add(1)
		go func() {
			defer group.Done()
			<-start
			assignee, err := store.claimTask(ctx, wedding, actor, shared)
			results <- result{assignee, err}
		}()
	}
	close(start)
	group.Wait()
	close(results)
	var winners, conflicts int
	for result := range results {
		switch {
		case result.err == nil && result.assignee != "":
			winners++
		case errors.Is(result.err, errWorkspaceConflict) && (result.assignee == "Brother" || result.assignee == "Cousin"):
			conflicts++
		default:
			t.Fatalf("unexpected claim result: %v", result.err)
		}
	}
	if winners != 1 || conflicts != 1 {
		t.Fatalf("expected one winner and one conflict, got %d and %d", winners, conflicts)
	}
	reopened, err := openWorkspace(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.db.Close()
	tasks, err = reopened.listTasks(ctx, wedding, owner)
	if err != nil || len(tasks) != 2 {
		t.Fatalf("reopening the database lost tasks: %v, %v", tasks, err)
	}
	for _, item := range tasks {
		if item.ID == shared && (item.Assignee == nil || item.Revision != 2) {
			t.Fatal("claim was not persisted")
		}
	}
}
