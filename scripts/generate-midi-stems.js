import fs from 'node:fs';
import path from 'node:path';
import MidiWriter from 'midi-writer-js';
import pkg from '@tonejs/midi';
const { Midi } = pkg;

const OUTPUT_DIR = path.resolve('public/audio/stems/midi');
const BPM = 96;
const TIME_SIGNATURE = [4, 4];
const BARS = 16;
const CHORD_PROGRESSION = ['Am', 'F', 'C', 'G']; // 4 bars repeated 4 times = 16 bars

// Ensure destination directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Created directory: ${OUTPUT_DIR}`);
}

/**
 * Helper to initialize a track with standard tempo, time signature, and meta info.
 */
function createTrack(name, instrument) {
  const track = new MidiWriter.Track();
  track.setTempo(BPM);
  track.setTimeSignature(TIME_SIGNATURE[0], TIME_SIGNATURE[1]);
  track.addTrackName(name);
  if (instrument !== undefined) {
    track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument }));
  }
  return track;
}

/**
 * ----------------------------------------------------------------------------
 * Stem 1: Bass Layer / Root Notes
 * - Low bass notes: A1, F1, C2, G1
 * - Whole notes (1 whole note per bar, soft attack)
 * - 16 bars total
 * ----------------------------------------------------------------------------
 */
function generateStem1() {
  const track = createTrack('Stem 1 - Bass Root Notes', 33); // 33 = Electric Bass (finger) / Acoustic Bass (32)

  const bassRoots = {
    Am: 'A1',
    F: 'F1',
    C: 'C2',
    G: 'G1',
  };

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const pitch = bassRoots[chord];
    // Gentle soft attack (velocity 68-72)
    const velocity = bar % 4 === 0 ? 72 : 68;

    track.addEvent(
      new MidiWriter.NoteEvent({
        pitch: [pitch],
        duration: '1', // 1 whole note (4 beats)
        velocity,
      })
    );
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 2: Harmony / Soft Chords
 * - Soft chords in 3rd octave:
 *   Am: A3-C4-E4
 *   F:  F3-A3-C4
 *   C:  C3-E3-G3
 *   G:  G3-B3-D4
 * - Whole notes per bar with soft attack
 * - 16 bars total
 * ----------------------------------------------------------------------------
 */
function generateStem2() {
  const track = createTrack('Stem 2 - Harmony Chords', 89); // 89 = Warm Pad / Synth Pad

  const chordVoicings = {
    Am: ['A3', 'C4', 'E4'],
    F: ['F3', 'A3', 'C4'],
    C: ['C3', 'E3', 'G3'],
    G: ['G3', 'B3', 'D4'],
  };

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const pitches = chordVoicings[chord];
    // Soft attack for lush harmonic bed
    const velocity = bar % 4 === 0 ? 64 : 60;

    track.addEvent(
      new MidiWriter.NoteEvent({
        pitch: pitches,
        duration: '1', // Sustained chord for full bar
        velocity,
      })
    );
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 3: Arpeggio / Melodic Motion
 * - Neoclassical undulating 16th-note arpeggios in 4th octave
 * - 16 sixteenth-notes per bar (256 notes total across 16 bars)
 * - Chord tones in 4th octave with subtle dynamic wave
 * ----------------------------------------------------------------------------
 */
function generateStem3() {
  const track = createTrack('Stem 3 - Neoclassical Arpeggio', 0); // 0 = Acoustic Grand Piano

  // Chord tones in 4th octave for smooth voice leading
  // Am: C4 - E4 - A4
  // F:  C4 - F4 - A4
  // C:  C4 - E4 - G4
  // G:  D4 - G4 - B4
  const patterns = {
    Am: ['C4', 'E4', 'A4', 'E4', 'C4', 'E4', 'A4', 'E4', 'C4', 'E4', 'A4', 'E4', 'C4', 'E4', 'A4', 'E4'],
    F:  ['C4', 'F4', 'A4', 'F4', 'C4', 'F4', 'A4', 'F4', 'C4', 'F4', 'A4', 'F4', 'C4', 'F4', 'A4', 'F4'],
    C:  ['C4', 'E4', 'G4', 'E4', 'C4', 'E4', 'G4', 'E4', 'C4', 'E4', 'G4', 'E4', 'C4', 'E4', 'G4', 'E4'],
    G:  ['D4', 'G4', 'B4', 'G4', 'D4', 'G4', 'B4', 'G4', 'D4', 'G4', 'B4', 'G4', 'D4', 'G4', 'B4', 'G4'],
  };

  // Expressive neoclassical velocity contour per beat (4 sixteenths per beat)
  const velocityContour = [
    74, 58, 64, 60, // Beat 1
    68, 58, 64, 60, // Beat 2
    72, 58, 64, 60, // Beat 3
    68, 58, 64, 60, // Beat 4
  ];

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const notes = patterns[chord];

    for (let step = 0; step < 16; step++) {
      const pitch = notes[step];
      const velocity = velocityContour[step];

      track.addEvent(
        new MidiWriter.NoteEvent({
          pitch: [pitch],
          duration: '16', // 16th note
          velocity,
        })
      );
    }
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 4: Bells / High Accents
 * - Rare ringing accents in 5-6th octave (bells / dewdrops) on strong beats
 * - Perfectly aligned to bars 1-16, ending at exactly 40.000s
 * ----------------------------------------------------------------------------
 */
function generateStem4() {
  const track = createTrack('Stem 4 - Crystal Bells', 14); // 14 = Tubular Bells / Celesta (8) / Glockenspiel (9)

  // Accents strictly on strong beats (beats 1 & 3)
  // Durations add up to 4 beats per bar:
  // - '1' = 4 beats (sustained bell ring-out)
  // - '2' + '2' = 2 beats (beat 1) + 2 beats (beat 3) = 4 beats
  const bellAccents = [
    // Cycle 1 (Bars 1-4)
    { bar: 1,  notes: [{ pitch: 'E6', duration: '1', vel: 86 }] },
    { bar: 2,  notes: [{ pitch: 'C6', duration: '1', vel: 82 }] },
    { bar: 3,  notes: [{ pitch: 'G5', duration: '2', vel: 84 }, { pitch: 'E6', duration: '2', vel: 78 }] },
    { bar: 4,  notes: [{ pitch: 'D6', duration: '1', vel: 80 }] },

    // Cycle 2 (Bars 5-8)
    { bar: 5,  notes: [{ pitch: 'A5', duration: '1', vel: 86 }] },
    { bar: 6,  notes: [{ pitch: 'F6', duration: '1', vel: 82 }] },
    { bar: 7,  notes: [{ pitch: 'E6', duration: '2', vel: 85 }, { pitch: 'G6', duration: '2', vel: 80 }] },
    { bar: 8,  notes: [{ pitch: 'B5', duration: '1', vel: 82 }] },

    // Cycle 3 (Bars 9-12)
    { bar: 9,  notes: [{ pitch: 'C6', duration: '2', vel: 86 }, { pitch: 'E6', duration: '2', vel: 80 }] },
    { bar: 10, notes: [{ pitch: 'A5', duration: '1', vel: 84 }] },
    { bar: 11, notes: [{ pitch: 'G6', duration: '2', vel: 88 }, { pitch: 'C6', duration: '2', vel: 82 }] },
    { bar: 12, notes: [{ pitch: 'D6', duration: '1', vel: 80 }] },

    // Cycle 4 (Bars 13-16)
    { bar: 13, notes: [{ pitch: 'E6', duration: '1', vel: 85 }] },
    { bar: 14, notes: [{ pitch: 'C6', duration: '1', vel: 82 }] },
    { bar: 15, notes: [{ pitch: 'G5', duration: '2', vel: 84 }, { pitch: 'E6', duration: '2', vel: 78 }] },
    { bar: 16, notes: [{ pitch: 'B5', duration: '1', vel: 82 }] },
  ];

  for (const barConfig of bellAccents) {
    for (const note of barConfig.notes) {
      track.addEvent(
        new MidiWriter.NoteEvent({
          pitch: [note.pitch],
          duration: note.duration,
          velocity: note.vel,
        })
      );
    }
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

// ============================================================================
// Execution and Verification
// ============================================================================
const generators = [
  { name: 'stem-1.mid', title: 'Stem 1 (Bass Root Notes)', fn: generateStem1 },
  { name: 'stem-2.mid', title: 'Stem 2 (Harmony Chords)', fn: generateStem2 },
  { name: 'stem-3.mid', title: 'Stem 3 (Neoclassical Arpeggio)', fn: generateStem3 },
  { name: 'stem-4.mid', title: 'Stem 4 (Crystal Bells)', fn: generateStem4 },
];

console.log('=== GENERATING 4 SYNCHRONOUS MIDI STEMS ===\n');

for (const gen of generators) {
  const filePath = path.join(OUTPUT_DIR, gen.name);
  const buffer = gen.fn();
  fs.writeFileSync(filePath, buffer);

  // Verification via @tonejs/midi
  const parsed = new Midi(buffer);
  const tempo = parsed.header.tempos[0]?.bpm ?? BPM;
  const timeSignature = parsed.header.timeSignatures[0]?.timeSignature ?? [4, 4];
  const duration = parsed.duration;
  const noteCount = parsed.tracks.reduce((sum, t) => sum + t.notes.length, 0);
  const firstNoteTime = parsed.tracks[0]?.notes[0]?.time ?? 0;
  const lastNote = parsed.tracks[0]?.notes[parsed.tracks[0].notes.length - 1];
  const lastNoteEndTime = lastNote ? (lastNote.time + lastNote.duration) : 0;

  console.log(`[OK] Generated: ${gen.name} (${gen.title})`);
  console.log(`     File size:       ${buffer.length} bytes`);
  console.log(`     Tempo:           ${tempo} BPM`);
  console.log(`     Time Signature:  ${timeSignature.join('/')}`);
  console.log(`     Total Duration:  ${duration.toFixed(3)}s (Target: 40.000s)`);
  console.log(`     Total Notes:     ${noteCount}`);
  console.log(`     Timeline:        ${firstNoteTime.toFixed(3)}s -> ${lastNoteEndTime.toFixed(3)}s`);
  console.log('');

  if (Math.abs(duration - 40.0) > 0.001) {
    console.error(`ERROR: Duration mismatch for ${gen.name}! Expected 40.000s, got ${duration}s`);
    process.exit(1);
  }
}

console.log('All 4 MIDI stems have been successfully generated and verified!');
