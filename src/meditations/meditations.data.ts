export interface MeditationStep {
  /** Seconds from the start at which this cue appears. */
  at: number;
  text: string;
}

export interface Meditation {
  id: string;
  title: string;
  subtitle: string;
  durationSeconds: number;
  timeOfDay: 'morning' | 'evening' | 'any';
  steps: MeditationStep[];
}

// Guided, text-and-timer meditations. Audio narration can be added later by
// attaching an audio URL; the player already works from these timed cues.
export const MEDITATIONS: Meditation[] = [
  {
    id: 'safe-place',
    title: 'Safe place',
    subtitle: 'Picture somewhere you feel at ease',
    durationSeconds: 300,
    timeOfDay: 'evening',
    steps: [
      { at: 0, text: 'Find a comfortable position. Let your shoulders drop.' },
      {
        at: 20,
        text: 'Breathe in slowly through your nose… and out through your mouth.',
      },
      {
        at: 50,
        text: 'Bring to mind a place where you feel calm and safe. Real or imagined.',
      },
      {
        at: 90,
        text: 'Notice what you can see there. The colours, the light.',
      },
      {
        at: 130,
        text: 'Notice the sounds. Maybe quiet, maybe gentle and familiar.',
      },
      {
        at: 170,
        text: 'Feel the temperature on your skin. Let your body settle into this place.',
      },
      {
        at: 220,
        text: 'This place is yours. You can come back whenever you need it.',
      },
      {
        at: 260,
        text: 'Take one more slow breath. When you are ready, open your eyes.',
      },
    ],
  },
  {
    id: 'box-breathing',
    title: 'Box breathing',
    subtitle: 'A steady rhythm for busy moments',
    durationSeconds: 180,
    timeOfDay: 'any',
    steps: [
      {
        at: 0,
        text: 'Sit upright and rest your hands. We will breathe in a square.',
      },
      {
        at: 15,
        text: 'Breathe in for four… hold for four… out for four… hold for four.',
      },
      {
        at: 60,
        text: 'Keep the rhythm. If your mind wanders, simply return to the count.',
      },
      { at: 120, text: 'Notice your breath slowing down by itself.' },
      { at: 165, text: 'Let the count go. Breathe naturally for a moment.' },
    ],
  },
  {
    id: 'morning-arrival',
    title: 'Arriving in the day',
    subtitle: 'Set a gentle intention',
    durationSeconds: 240,
    timeOfDay: 'morning',
    steps: [
      { at: 0, text: 'Before the day begins, take a moment just for you.' },
      {
        at: 20,
        text: 'Feel your feet on the floor and the weight of your body.',
      },
      {
        at: 60,
        text: 'Notice how you are feeling, without needing to change it.',
      },
      {
        at: 110,
        text: 'Choose one small thing you would like to carry with you today.',
      },
      { at: 170, text: 'Say it quietly to yourself. Let it be enough.' },
      { at: 220, text: 'Take a breath, and step into your day.' },
    ],
  },
];
