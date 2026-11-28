import { Composition, Folder } from 'remotion'
import { InviteVideo, INVITE_FRAMES } from './wedding/InviteVideo'
import { PlannerInvite, PlannerSaveTheDate, sampleSnapshot } from './wedding/Planner'
import { SaveTheDate, SAVE_THE_DATE_FRAMES } from './wedding/SaveTheDate'
import { H, W } from './wedding/parts'
import { samples } from './wedding/samples'

// One composition of each kind per sample language, so every script can be
// previewed and rendered. The render script overrides props for real weddings.
export function Root() {
  return <><Folder name="Planner">
    <Composition id="planner-save-the-date" component={PlannerSaveTheDate} defaultProps={sampleSnapshot}
      durationInFrames={SAVE_THE_DATE_FRAMES} fps={30} width={W} height={H} />
    <Composition id="planner-invite" component={PlannerInvite} defaultProps={sampleSnapshot}
      durationInFrames={INVITE_FRAMES} fps={30} width={W} height={H} />
  </Folder>
  <Folder name="Wedding">
    {Object.entries(samples).map(([language, props]) => <Folder key={language} name={language}>
      <Composition id={`save-the-date-${language}`} component={SaveTheDate} defaultProps={props}
        durationInFrames={SAVE_THE_DATE_FRAMES} fps={30} width={W} height={H} />
      <Composition id={`invite-${language}`} component={InviteVideo} defaultProps={props}
        durationInFrames={INVITE_FRAMES} fps={30} width={W} height={H} />
    </Folder>)}
  </Folder></>
}
