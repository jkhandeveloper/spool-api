export interface MeditationStep {
  /** Seconds from the start at which this cue appears. */
  at: number;
  text: string;
}

/** Part of the day, by the client's local 24-hour clock (see `dayPeriod`). */
export type DayPeriod = 'morning' | 'afternoon' | 'night';

export interface Meditation {
  id: string;
  title: string;
  subtitle: string;
  durationSeconds: number;
  timeOfDay: DayPeriod | 'any';
  /**
   * Part of the "All day" series: one meditation per part of the day. Clients
   * show the one whose `timeOfDay` matches the current local time.
   */
  allDay: boolean;
  steps: MeditationStep[];
}

/**
 * Morning 04:00–11:59, afternoon 12:00–17:59, night 18:00–03:59. Each period
 * starts at 04:00, 12:00 and 18:00 and runs until the next one begins.
 */
export function dayPeriod(hour: number): DayPeriod {
  if (hour >= 4 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'night';
}

/** Builds evenly paced cues so silences between spoken lines stay short. */
function paced(lines: string[], every = 11): MeditationStep[] {
  return lines.map((text, index) => ({ at: index * every, text }));
}

/** Rough narration pace of the slow, calm TTS voice, measured on these scripts. */
const SECONDS_PER_WORD = 0.45;

/**
 * Times cues by their length so every pause comes out about the same and the
 * last line finishes `tail` seconds before the end. Use this for scripts whose
 * lines vary a lot in length.
 */
function timed(lines: string[], total = 180, tail = 8): MeditationStep[] {
  const speech = lines.map(
    (text) => text.split(/\s+/).length * SECONDS_PER_WORD,
  );
  const spoken = speech.reduce((sum, seconds) => sum + seconds, 0);
  const pause = (total - tail - spoken) / (lines.length - 1);
  let at = 0;
  return lines.map((text, index) => {
    const step = { at: Math.round(at), text };
    at += speech[index] + pause;
    return step;
  });
}

// Guided three-minute meditations. Each cue is narrated by the audio endpoint
// and mixed into one continuous track; cues are ~11 s apart so the voice keeps
// guiding with only a short, restful pause between lines.
export const MEDITATIONS: Meditation[] = [
  {
    id: 'all-day-morning',
    title: 'Morning: a fresh start',
    subtitle: 'Wake gently and set the tone for your day',
    durationSeconds: 180,
    timeOfDay: 'morning',
    allDay: true,
    steps: timed([
      'Close your eyes. Sit comfortably.',
      'Take a deep breath in… and slowly breathe out.',
      'Feel your body waking up. Feel your feet on the ground. Feel your shoulders relax.',
      'Take another deep breath in… hold for 2 seconds… and let it all go.',
      'Today is a new day. Yesterday is gone.',
      'Tomorrow is not here yet. You only have this moment.',
      'Say in your mind: I am calm. I am safe. I am enough.',
      'Breathe in peace… Breathe out stress…',
      'Imagine a warm golden light from the sun falling on your face.',
      'It fills your head, your heart, your whole body with calm energy.',
      'Let go of any worry. Let go of any fear.',
      "You don't need to carry it today.",
      'Take one more deep breath in… and as you breathe out, smile gently.',
      'When you are ready, slowly open your eyes.',
      'Today, I choose peace.',
      'Today, I choose to be happy.',
    ]),
  },
  {
    id: 'all-day-afternoon',
    title: 'Afternoon: reset and refocus',
    subtitle: 'A midday pause to release tension and recharge',
    durationSeconds: 180,
    timeOfDay: 'afternoon',
    allDay: true,
    steps: paced([
      'Welcome to your afternoon pause. Wherever you are, let yourself stop for just three minutes.',
      'Sit back, rest your hands, and let your eyes soften or close.',
      'Take a deep breath in… and let out a long, slow breath, releasing the morning behind you.',
      'Notice your jaw. If it is tight, let it loosen. Let your tongue rest softly.',
      'Notice your shoulders. Let them drop away from your ears, heavier with each breath out.',
      'Breathe in for four counts… and breathe out for six, slower than the breath in.',
      'Again, in for four… and out for six. Let the longer breath out calm your body.',
      'Notice any thoughts about what is left to do. Let them wait for a moment. They will still be there.',
      'Bring your attention to your feet on the ground. Feel them solid and supported.',
      'Notice one thing that has gone well today, even something small. Let yourself appreciate it.',
      'If today has been hard, that is okay too. You are doing your best, and that is enough.',
      'Breathe in clarity and fresh focus… breathe out tiredness and tension.',
      'Think of the next small thing you will do after this pause. Just one thing.',
      'Picture yourself doing it calmly, one step at a time.',
      'Take one more full breath in… and let it go.',
      'Gently open your eyes and return to your afternoon, a little lighter than before.',
    ]),
  },
  {
    id: 'all-day-night',
    title: 'Night: let the day go',
    subtitle: 'Unwind, release the day and prepare for rest',
    durationSeconds: 180,
    timeOfDay: 'night',
    allDay: true,
    steps: paced([
      'Good evening. The day is coming to a close, and now it is time to rest.',
      'Lie down or sit comfortably. Let your body be fully supported.',
      'Breathe in slowly… and as you breathe out, let your whole body grow a little heavier.',
      'Again, breathe in… and out, letting go of the effort of the day.',
      'Relax your forehead and the space between your eyebrows. Let your face soften.',
      'Let your shoulders sink down. Let your arms and hands rest, loose and heavy.',
      'Let your belly rise and fall naturally. There is nothing you need to do now.',
      'Let your legs and feet relax completely, as if they are sinking into the bed.',
      'Think back gently over your day. Notice one moment you would like to keep.',
      'If something difficult happened, acknowledge it kindly. You can set it down for tonight.',
      'Imagine placing any worries in a box beside you. They can wait until tomorrow.',
      'Thank yourself for getting through today. You did enough. You are enough.',
      'Breathe in calm… and breathe out, letting go a little more each time.',
      'Feel the stillness around you, and the quiet settling into your body.',
      'Let your breath become slow and easy, carrying you towards sleep.',
      'Rest now. You are safe, and the day is complete. Good night.',
    ]),
  },
  {
    id: 'body-scan',
    title: 'Gentle body scan',
    subtitle: 'Release tension from head to toe',
    durationSeconds: 180,
    timeOfDay: 'any',
    allDay: false,
    steps: paced([
      'Find a comfortable position, sitting or lying down. Let your eyes close if that feels right.',
      'Take a slow breath in… and a long breath out. Let your body begin to settle.',
      'Bring your attention to the top of your head. Notice any sensation there, without judging it.',
      'Let your attention move to your forehead and eyes. Let them soften and relax.',
      'Notice your jaw and mouth. Unclench your teeth, and let your jaw hang loose.',
      'Move down to your neck and shoulders. As you breathe out, let them release.',
      'Feel your arms, from your shoulders down to your fingertips. Let them grow heavy and warm.',
      'Notice your chest rising and falling with each breath. Let it move on its own.',
      'Bring your attention to your belly. Let it be soft. There is nothing to hold in.',
      'Notice your back, and where it meets the chair or the floor. Let yourself be supported.',
      'Move to your hips and your legs. Feel their weight, and let them relax.',
      'Notice your knees, your calves, and your ankles. Let any tightness melt away.',
      'Finally, notice your feet, all the way to the tips of your toes.',
      'Now feel your whole body at once, breathing, resting, held.',
      'Take a deep breath in, through your whole body… and let it go.',
      'Slowly wiggle your fingers and toes, and when you are ready, open your eyes.',
    ]),
  },
  {
    id: 'safe-place',
    title: 'Safe place',
    subtitle: 'Picture somewhere you feel at ease',
    durationSeconds: 180,
    timeOfDay: 'night',
    allDay: false,
    steps: paced([
      'Find a comfortable position. Let your shoulders drop and your hands rest.',
      'Breathe in slowly through your nose… and out through your mouth.',
      'Again, in through your nose… and a long, slow breath out.',
      'Bring to mind a place where you feel calm and safe. It can be real or imagined.',
      'It might be a beach, a quiet room, a forest, or somewhere from your childhood.',
      'Picture yourself arriving there. Notice what you can see. The colours, the light.',
      'Notice the sounds of this place. Maybe quiet, maybe gentle and familiar.',
      'Notice the air on your skin. Is it warm or cool? Is there a soft breeze?',
      'Notice any smells. Fresh air, the sea, rain, or something comforting.',
      'Feel what you are resting on. Sand, grass, a soft chair. Let your body settle into it.',
      'Nothing here needs anything from you. You can simply be.',
      'Breathe in the calm of this place… and breathe out anything you are carrying.',
      'Notice how safe your body feels here. Remember this feeling.',
      'This place is yours. You can come back whenever you need it, just by closing your eyes.',
      'Take one more slow breath here, and gently say goodbye for now.',
      'When you are ready, slowly open your eyes, bringing that calm back with you.',
    ]),
  },
  {
    id: 'box-breathing',
    title: 'Box breathing',
    subtitle: 'A steady rhythm for busy moments',
    durationSeconds: 180,
    timeOfDay: 'any',
    allDay: false,
    steps: paced([
      'Sit upright and rest your hands. We will breathe in a square, four counts on each side.',
      'First, breathe out fully, emptying your lungs.',
      'Breathe in, two, three, four… hold, two, three, four.',
      'Breathe out, two, three, four… hold, two, three, four.',
      'Breathe in, two, three, four… hold, two, three, four.',
      'Breathe out, two, three, four… hold, two, three, four.',
      'Keep the rhythm. If your mind wanders, simply return to the count.',
      'Breathe in, two, three, four… hold, two, three, four.',
      'Breathe out, two, three, four… hold, two, three, four.',
      'Notice your breath slowing down, and your body growing calmer.',
      'Breathe in, two, three, four… hold, two, three, four.',
      'Breathe out, two, three, four… hold, two, three, four.',
      'One more time. Breathe in, two, three, four… hold, two, three, four.',
      'Breathe out, two, three, four… hold, two, three, four.',
      'Now let the count go, and breathe naturally for a moment.',
      'Notice how you feel. You can use this square of breath whenever you need it.',
    ]),
  },
  {
    id: 'morning-arrival',
    title: 'Arriving in the day',
    subtitle: 'Set a gentle intention',
    durationSeconds: 180,
    timeOfDay: 'morning',
    allDay: false,
    steps: paced([
      'Before the day begins, take a moment just for you.',
      'Sit comfortably, and take a slow breath in… and out.',
      'Feel your feet on the floor and the weight of your body.',
      'Notice where your body touches the chair or the bed. Let it hold you.',
      'Take another breath in… and let it out slowly.',
      'Notice how you are feeling this morning, without needing to change it.',
      'If there is worry about the day ahead, simply notice it, and let it be.',
      'Bring your attention back to your breath, steady and reliable.',
      'Choose one small thing you would like to carry with you today.',
      'It might be patience, a kind word, or remembering to rest.',
      'Say it quietly to yourself. Let it be enough.',
      'Imagine a moment later today when you will need it, and see yourself remembering.',
      'Breathe in, and feel that intention settle in you.',
      'Breathe out, and let go of anything you do not need to carry.',
      'One more slow breath, in… and out.',
      'Take a breath, open your eyes, and step into your day.',
    ]),
  },
];
