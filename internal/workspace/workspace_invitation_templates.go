package workspace

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"regexp"
	"slices"

	"github.com/ajz007/shaadi-planner-pro/web"
)

// An invitation template is a design that renders the shared invitation
// content. Its manifest (web/src/invitation/templates/<id>/manifest.json) is read by both
// the editor and this server: the editor builds the "Design options" form
// from it, and the server accepts only the options a template declares.

var invitationSections = []string{"blessing", "hero", "countdown", "couple", "events", "rsvp", "family", "venue", "contacts", "closing"}

var templateKey = regexp.MustCompile(`^[a-z][a-zA-Z0-9]{0,39}$`)

type templateChoice struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type templateOption struct {
	Key     string           `json:"key"`
	Label   string           `json:"label"`
	Type    string           `json:"type"`
	Default json.RawMessage  `json:"default"`
	Max     int              `json:"max,omitempty"`
	Choices []templateChoice `json:"choices,omitempty"`
	Help    string           `json:"help,omitempty"`
}

type invitationTemplate struct {
	ID          string           `json:"id"`
	Version     int              `json:"version"`
	Order       int              `json:"order"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Premium     bool             `json:"premium"`
	Sections    []string         `json:"sections"`
	Options     []templateOption `json:"options"`
}

type invitationDesign struct {
	ID      string         `json:"id"`
	Version int            `json:"version"`
	Options map[string]any `json:"options"`
}

const defaultInvitationTemplate = "blush-envelope"

var invitationTemplates = mustLoadTemplates(web.InvitationTemplates)

func mustLoadTemplates(files fs.FS) map[string]invitationTemplate {
	list, err := readTemplates(files)
	if err == nil {
		var templates map[string]invitationTemplate
		if templates, err = checkTemplates(list); err == nil {
			return templates
		}
	}
	panic("invalid invitation template manifest: " + err.Error())
}

// readTemplates reads one manifest per template folder. The folder name must
// match the manifest id, so the editor and server always agree on the id.
func readTemplates(files fs.FS) ([]invitationTemplate, error) {
	paths, err := fs.Glob(files, "src/invitation/templates/*/manifest.json")
	if err != nil {
		return nil, err
	}
	list := make([]invitationTemplate, 0, len(paths))
	for _, file := range paths {
		raw, err := fs.ReadFile(files, file)
		if err != nil {
			return nil, err
		}
		var template invitationTemplate
		if err := json.Unmarshal(raw, &template); err != nil {
			return nil, fmt.Errorf("%s: %w", file, err)
		}
		if folder := path.Base(path.Dir(file)); folder != template.ID {
			return nil, fmt.Errorf("%s: id %q does not match its folder %q", file, template.ID, folder)
		}
		list = append(list, template)
	}
	return list, nil
}

// checkTemplates checks every manifest, so a broken manifest fails at startup
// and in tests rather than when a family saves.
func checkTemplates(list []invitationTemplate) (map[string]invitationTemplate, error) {
	templates := map[string]invitationTemplate{}
	for _, template := range list {
		if !regexp.MustCompile(`^[a-z0-9-]{1,40}$`).MatchString(template.ID) || template.Version < 1 || template.Name == "" ||
			len(template.Sections) == 0 {
			return nil, fmt.Errorf("template %q: missing id, version, name or sections", template.ID)
		}
		if _, duplicate := templates[template.ID]; duplicate {
			return nil, fmt.Errorf("template %q is listed twice", template.ID)
		}
		for i, section := range template.Sections {
			if !slices.Contains(invitationSections, section) || slices.Index(template.Sections, section) != i {
				return nil, fmt.Errorf("template %q: unknown or repeated section %q", template.ID, section)
			}
		}
		keys := map[string]bool{}
		for _, option := range template.Options {
			if !templateKey.MatchString(option.Key) || keys[option.Key] || option.Label == "" {
				return nil, fmt.Errorf("template %q: invalid or repeated option %q", template.ID, option.Key)
			}
			keys[option.Key] = true
			var value any
			if err := json.Unmarshal(option.Default, &value); err != nil {
				return nil, fmt.Errorf("template %q option %q: invalid default", template.ID, option.Key)
			}
			if option.Type == "text" && option.Max < 1 {
				return nil, fmt.Errorf("template %q option %q: text needs a max", template.ID, option.Key)
			}
			if option.Type == "choice" && len(option.Choices) == 0 {
				return nil, fmt.Errorf("template %q option %q: choice needs choices", template.ID, option.Key)
			}
			if _, ok := option.check(value); !ok {
				return nil, fmt.Errorf("template %q option %q: default does not match its type", template.ID, option.Key)
			}
		}
		templates[template.ID] = template
	}
	if _, ok := templates[defaultInvitationTemplate]; !ok {
		return nil, fmt.Errorf("default template %q is missing", defaultInvitationTemplate)
	}
	return templates, nil
}

func (o templateOption) check(value any) (any, bool) {
	switch o.Type {
	case "boolean":
		v, ok := value.(bool)
		return v, ok
	case "text":
		text, ok := value.(string)
		if !ok || !cleanText(&text, o.Max, false) {
			return nil, false
		}
		return text, true
	case "choice":
		text, ok := value.(string)
		return text, ok && slices.ContainsFunc(o.Choices, func(choice templateChoice) bool { return choice.Value == text })
	}
	return nil, false
}

func (o templateOption) defaultValue() any {
	var value any
	_ = json.Unmarshal(o.Default, &value)
	return value
}

// normalize returns the complete option set for a template. With strict set,
// unknown keys or invalid values reject the save. Without it (reading stored
// data), anything that no longer fits falls back to the template default.
func (t invitationTemplate) normalize(options map[string]any, strict bool) (map[string]any, bool) {
	result := make(map[string]any, len(t.Options))
	for key := range options {
		if strict && !slices.ContainsFunc(t.Options, func(option templateOption) bool { return option.Key == key }) {
			return nil, false
		}
	}
	for _, option := range t.Options {
		value, present := options[option.Key]
		if !present {
			result[option.Key] = option.defaultValue()
			continue
		}
		checked, ok := option.check(value)
		if !ok {
			if strict {
				return nil, false
			}
			checked = option.defaultValue()
		}
		result[option.Key] = checked
	}
	return result, true
}

// storedDesign rebuilds the design from saved columns. A template that has
// since been removed falls back to the default template.
func storedDesign(id string, version int, raw []byte) invitationDesign {
	template, ok := invitationTemplates[id]
	if !ok {
		template, version = invitationTemplates[defaultInvitationTemplate], 0
	}
	if version < 1 {
		version = template.Version
	}
	var options map[string]any
	_ = json.Unmarshal(raw, &options)
	normalized, _ := template.normalize(options, false)
	return invitationDesign{ID: template.ID, Version: version, Options: normalized}
}
