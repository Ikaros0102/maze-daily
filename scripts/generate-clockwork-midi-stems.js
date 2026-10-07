import fs from 'node:fs';
import path from 'node:path';
import MidiWriter from 'midi-writer-js';
import pkg from '@tonejs/midi';
const { Midi } = pkg;

const OUTPUT_DIR = path.resolve('public/audio/packs/clockwork/midi');
const BPM = 96;
const TIME_SIGNATURE = [4, 4];
const BARS = 16;
const CHORD_PROGRESSION = ['C', 'G', 'Am', 'F']; // 4 bars repeated 4 times = 16 bars

// Ensure destination directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Created directory: ${OUTPUT_DIR}`);
}

/**
 * Helper to initialize a track with standard tempo, time signature, track name, and instrument.
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
 * Stem 1: Pizzicato Cello / Mechanical Bass (Root Notes)
 * - Roots: C2, G1, A1, F1
 * - Metronomic clockwork step on beats 1 and 3 (half notes)
 * - GM Instrument: 42 (Cello) / 45 (Pizzicato Strings)
 * ----------------------------------------------------------------------------
 */
function generateStem1() {
  const track = createTrack('Stem 1 - Pizzicato Mechanical Cello', 42);

  const bassRoots = {
    C: 'C2',
    G: 'G1',
    Am: 'A1',
    F: 'F1',
  };

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const root = bassRoots[chord];

    // Beat 1: Clockwork tick (beats 1-2)
    track.addEvent(
      new MidiWriter.NoteEvent({
        pitch: [root],
        duration: '2',
        velocity: 86,
      })
    );

    // Beat 3: Clockwork tock (beats 3-4)
    track.addEvent(
      new MidiWriter.NoteEvent({
        pitch: [root],
        duration: '2',
        velocity: 76,
      })
    );
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 2: Toy Piano / Staccato Chords
 * - Short playful staccato chords in octave 3-4:
 *   C:  G3 - C4 - E4
 *   G:  G3 - B3 - D4
 *   Am: A3 - C4 - E4
 *   F:  A3 - C4 - F4
 * - Whimsical bouncy rhythm (quarter, quarter, eighth, eighth, quarter)
 * - GM Instrument: 0 (Acoustic Piano / Toy Piano)
 * ----------------------------------------------------------------------------
 */
function generateStem2() {
  const track = createTrack('Stem 2 - Toy Piano Staccato', 0);

  const chordVoicings = {
    C: ['G3', 'C4', 'E4'],
    G: ['G3', 'B3', 'D4'],
    Am: ['A3', 'C4', 'E4'],
    F: ['A3', 'C4', 'F4'],
  };

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const pitches = chordVoicings[chord];

    // Beat 1: Quarter note (vel 74)
    track.addEvent(new MidiWriter.NoteEvent({ pitch: pitches, duration: '4', velocity: 74 }));
    // Beat 2: Quarter note (vel 60)
    track.addEvent(new MidiWriter.NoteEvent({ pitch: pitches, duration: '4', velocity: 60 }));
    // Beat 3: Eighth note (vel 70)
    track.addEvent(new MidiWriter.NoteEvent({ pitch: pitches, duration: '8', velocity: 70 }));
    // Beat 3.5: Eighth note (vel 64)
    track.addEvent(new MidiWriter.NoteEvent({ pitch: pitches, duration: '8', velocity: 64 }));
    // Beat 4: Quarter note (vel 62)
    track.addEvent(new MidiWriter.NoteEvent({ pitch: pitches, duration: '4', velocity: 62 }));
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 3: Music Box / Swirling Melody
 * - Classic music box swirling 16th-note motif in 5th octave (256 notes across 16 bars)
 * - GM Instrument: 10 (Music Box)
 * ----------------------------------------------------------------------------
 */
function generateStem3() {
  const track = createTrack('Stem 3 - Swirling Music Box', 10);

  const patterns = {
    C:  ['C5', 'E5', 'G5', 'C6', 'G5', 'E5', 'G5', 'C6', 'C5', 'E5', 'G5', 'C6', 'G5', 'E5', 'G5', 'E5'],
    G:  ['B4', 'D5', 'G5', 'B5', 'G5', 'D5', 'G5', 'B5', 'B4', 'D5', 'G5', 'B5', 'G5', 'D5', 'G5', 'D5'],
    Am: ['C5', 'E5', 'A5', 'C6', 'A5', 'E5', 'A5', 'C6', 'C5', 'E5', 'A5', 'C6', 'A5', 'E5', 'A5', 'E5'],
    F:  ['C5', 'F5', 'A5', 'C6', 'A5', 'F5', 'A5', 'C6', 'C5', 'F5', 'A5', 'C6', 'A5', 'F5', 'A5', 'F5'],
  };

  const velocityContour = [
    76, 62, 68, 64, // Beat 1
    72, 62, 68, 64, // Beat 2
    74, 62, 68, 64, // Beat 3
    72, 62, 68, 62, // Beat 4
  ];

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const notes = patterns[chord];

    for (let step = 0; step < 16; step++) {
      track.addEvent(
        new MidiWriter.NoteEvent({
          pitch: [notes[step]],
          duration: '16',
          velocity: velocityContour[step],
        })
      );
    }
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 4: Celesta / Crystal Finale & Trills
 * - Rare floating major trills (16th flutter) and high glassy notes in 6th octave
 * - Concludes at exactly 40.000s
 * - GM Instrument: 8 (Celesta)
 * ----------------------------------------------------------------------------
 */
function generateStem4() {
  const track = createTrack('Stem 4 - Crystal Celesta Trills', 8);

  const celestaBars = [
    // Cycle 1 (Bars 1-4)
    { type: 'pure', note: 'C6', vel: 86 },
    { type: 'trill', trill: ['D6', 'E6', 'D6', 'B6'], sustain: 'G6', vel: 84 },
    { type: 'pure', note: 'E6', vel: 85 },
    { type: 'trill', trill: ['F6', 'G6', 'F6', 'A6'], sustain: 'C6', vel: 84 },

    // Cycle 2 (Bars 5-8)
    { type: 'pure', note: 'G6', vel: 88 },
    { type: 'trill', trill: ['B6', 'C7', 'B6', 'G6'], sustain: 'D6', vel: 86 },
    { type: 'pure', note: 'A6', vel: 88 },
    { type: 'trill', trill: ['A6', 'B6', 'A6', 'F6'], sustain: 'C6', vel: 85 },

    // Cycle 3 (Bars 9-12)
    { type: 'trill', trill: ['C6', 'D6', 'C6', 'E6'], sustain: 'G6', vel: 86 },
    { type: 'pure', note: 'B6', vel: 86 },
    { type: 'trill', trill: ['E6', 'F6', 'E6', 'C6'], sustain: 'A6', vel: 88 },
    { type: 'pure', note: 'F6', vel: 84 },

    // Cycle 4 (Bars 13-16)
    { type: 'pure', note: 'E6', vel: 86 },
    { type: 'trill', trill: ['D6', 'E6', 'D6', 'B6'], sustain: 'G6', vel: 85 },
    { type: 'pure', note: 'A6', vel: 88 },
    { type: 'pure', note: 'C6', vel: 90 }, // Final crystalline resolution to C6 (whole note)
  ];

  for (const bar of celestaBars) {
    if (bar.type === 'pure') {
      // 1 whole note (4 beats)
      track.addEvent(
        new MidiWriter.NoteEvent({
          pitch: [bar.note],
          duration: '1',
          velocity: bar.vel,
        })
      );
    } else {
      // 4 sixteenth notes (1 beat trill flutter) + dotted half note (3 beats sustain) = 4 beats
      for (const tNote of bar.trill) {
        track.addEvent(
          new MidiWriter.NoteEvent({
            pitch: [tNote],
            duration: '16',
            velocity: bar.vel - 6,
          })
        );
      }
      track.addEvent(
        new MidiWriter.NoteEvent({
          pitch: [bar.sustain],
          duration: 'd2', // Dotted half note = 3 beats
          velocity: bar.vel,
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
  { name: 'stem-1.mid', title: 'Stem 1 (Pizzicato Mechanical Cello)', fn: generateStem1 },
  { name: 'stem-2.mid', title: 'Stem 2 (Toy Piano Staccato)', fn: generateStem2 },
  { name: 'stem-3.mid', title: 'Stem 3 (Swirling Music Box)', fn: generateStem3 },
  { name: 'stem-4.mid', title: 'Stem 4 (Crystal Celesta Trills)', fn: generateStem4 },
];

console.log('=== GENERATING 4 SYNCHRONOUS MIDI STEMS FOR "CLOCKWORK MUSIC BOX" ===\n');

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
  console.log(`     File path:       ${filePath}`);
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

console.log('All 4 Clockwork Music Box MIDI stems have been successfully generated and verified!');
