import fs from 'node:fs';
import path from 'node:path';
import MidiWriter from 'midi-writer-js';
import pkg from '@tonejs/midi';
const { Midi } = pkg;

const OUTPUT_DIR = path.resolve('public/audio/packs/synth/midi');
const BPM = 96;
const TIME_SIGNATURE = [4, 4];
const BARS = 16;
const CHORD_PROGRESSION = ['Dm', 'Bb', 'F', 'C']; // 4 bars repeated 4 times = 16 bars

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
 * Stem 1: Rolling Synth Bass (80s Synth Bass)
 * - Roots: D1, Bb0, F1, C1
 * - Pulsating 8th notes (8 per bar, 128 total across 16 bars)
 * - Driving velocity groove with hard punch on beat 1
 * - GM Instrument: 38 (Synth Bass 1)
 * ----------------------------------------------------------------------------
 */
function generateStem1() {
  const track = createTrack('Stem 1 - Rolling Synth Bass', 38);

  const bassRoots = {
    Dm: 'D1',
    Bb: 'Bb0',
    F: 'F1',
    C: 'C1',
  };

  // 80s rolling 8th note velocity pattern (pumping groove)
  const bassVelocities = [96, 76, 84, 74, 88, 76, 84, 74];

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const root = bassRoots[chord];

    for (let eighth = 0; eighth < 8; eighth++) {
      track.addEvent(
        new MidiWriter.NoteEvent({
          pitch: [root],
          duration: '8',
          velocity: bassVelocities[eighth],
        })
      );
    }
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 2: Stabs / Short Chords (Synth Chords)
 * - Syncopated rhythm on off-beats (1&, 2&, 3&, 4&) in octave 3:
 *   Dm: D3 - F3 - A3
 *   Bb: D3 - F3 - Bb3
 *   F:  C3 - F3 - A3
 *   C:  C3 - E3 - G3
 * - Sharp, snappy transients
 * - GM Instrument: 62 (Synth Brass 1)
 * ----------------------------------------------------------------------------
 */
function generateStem2() {
  const track = createTrack('Stem 2 - Synth Chords Stabs', 62);

  const chordVoicings = {
    Dm: ['D3', 'F3', 'A3'],
    Bb: ['D3', 'F3', 'Bb3'],
    F: ['C3', 'F3', 'A3'],
    C: ['C3', 'E3', 'G3'],
  };

  const stabVelocities = [88, 80, 86, 82]; // 1&, 2&, 3&, 4&

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const pitches = chordVoicings[chord];

    for (let offbeat = 0; offbeat < 4; offbeat++) {
      track.addEvent(
        new MidiWriter.NoteEvent({
          pitch: pitches,
          duration: '8',
          wait: '8', // Rests on the downbeats, hits on the upbeats
          velocity: stabVelocities[offbeat],
        })
      );
    }
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 3: Sharp Arpeggiator (Synth Pluck Arp)
 * - Ultra-crisp 16th-note running arpeggios in octave 4 (256 notes across 16 bars)
 * - High transient velocities
 * - GM Instrument: 81 (Lead 2 - Sawtooth)
 * ----------------------------------------------------------------------------
 */
function generateStem3() {
  const track = createTrack('Stem 3 - Sharp Synth Pluck Arp', 81);

  const patterns = {
    Dm: ['D4', 'F4', 'A4', 'D5', 'A4', 'F4', 'A4', 'D5', 'D4', 'F4', 'A4', 'D5', 'A4', 'F4', 'A4', 'F4'],
    Bb: ['D4', 'F4', 'Bb4', 'D5', 'Bb4', 'F4', 'Bb4', 'D5', 'D4', 'F4', 'Bb4', 'D5', 'Bb4', 'F4', 'Bb4', 'F4'],
    F:  ['C4', 'F4', 'A4', 'C5', 'A4', 'F4', 'A4', 'C5', 'C4', 'F4', 'A4', 'C5', 'A4', 'F4', 'A4', 'F4'],
    C:  ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'G4', 'C5', 'C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'G4', 'E4'],
  };

  // Piercing 16th-note velocity transient contour
  const arpVelocities = [
    94, 76, 84, 78, // Beat 1
    90, 76, 84, 78, // Beat 2
    92, 76, 84, 78, // Beat 3
    90, 76, 84, 78, // Beat 4
  ];

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const notes = patterns[chord];

    for (let step = 0; step < 16; step++) {
      track.addEvent(
        new MidiWriter.NoteEvent({
          pitch: [notes[step]],
          duration: '16',
          velocity: arpVelocities[step],
        })
      );
    }
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 4: Ringing Digital Bells / Neon Lead (Chiptune/FM Bell)
 * - Bright, cutting melodic phrases in 5-6th octave
 * - Perfectly timed to conclude mathematically at 40.000s
 * - GM Instrument: 98 (FX 3 - Crystal)
 * ----------------------------------------------------------------------------
 */
function generateStem4() {
  const track = createTrack('Stem 4 - Digital FM Bell Lead', 98);

  const phrases = [
    // Cycle 1 (Bars 1-4): Theme introduction
    [ { p: 'A5', d: '2', v: 92 }, { p: 'F5', d: '4', v: 85 }, { p: 'D5', d: '4', v: 80 } ],
    [ { p: 'Bb5', d: '2', v: 94 }, { p: 'D6', d: '4', v: 88 }, { p: 'F6', d: '4', v: 90 } ],
    [ { p: 'E6', d: '2', v: 92 }, { p: 'C6', d: '2', v: 86 } ],
    [ { p: 'G5', d: '2', v: 88 }, { p: 'A5', d: '2', v: 90 } ],

    // Cycle 2 (Bars 5-8): Higher octave lift
    [ { p: 'D6', d: '2', v: 95 }, { p: 'A5', d: '4', v: 86 }, { p: 'F5', d: '4', v: 82 } ],
    [ { p: 'F6', d: '2', v: 96 }, { p: 'D6', d: '4', v: 90 }, { p: 'Bb5', d: '4', v: 85 } ],
    [ { p: 'A6', d: '2', v: 98 }, { p: 'F6', d: '2', v: 90 } ],
    [ { p: 'G6', d: '2', v: 94 }, { p: 'E6', d: '2', v: 88 } ],

    // Cycle 3 (Bars 9-12): Cascading neon phrases
    [ { p: 'F6', d: '4', v: 94 }, { p: 'E6', d: '4', v: 88 }, { p: 'D6', d: '2', v: 96 } ],
    [ { p: 'D6', d: '4', v: 92 }, { p: 'C6', d: '4', v: 86 }, { p: 'Bb5', d: '2', v: 94 } ],
    [ { p: 'C6', d: '4', v: 90 }, { p: 'Bb5', d: '4', v: 85 }, { p: 'A5', d: '2', v: 92 } ],
    [ { p: 'G5', d: '2', v: 88 }, { p: 'C6', d: '2', v: 95 } ],

    // Cycle 4 (Bars 13-16): Climax and resolution to root D6
    [ { p: 'A5', d: '2', v: 94 }, { p: 'D6', d: '2', v: 98 } ],
    [ { p: 'F6', d: '2', v: 96 }, { p: 'D6', d: '2', v: 92 } ],
    [ { p: 'E6', d: '2', v: 94 }, { p: 'C6', d: '2', v: 90 } ],
    [ { p: 'D6', d: '1', v: 98 } ], // Sustaining whole note ending at 40.000s
  ];

  for (const barNotes of phrases) {
    for (const note of barNotes) {
      track.addEvent(
        new MidiWriter.NoteEvent({
          pitch: [note.p],
          duration: note.d,
          velocity: note.v,
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
  { name: 'stem-1.mid', title: 'Stem 1 (Rolling Synth Bass)', fn: generateStem1 },
  { name: 'stem-2.mid', title: 'Stem 2 (Synth Chords Stabs)', fn: generateStem2 },
  { name: 'stem-3.mid', title: 'Stem 3 (Sharp Synth Pluck Arp)', fn: generateStem3 },
  { name: 'stem-4.mid', title: 'Stem 4 (Digital FM Bell Lead)', fn: generateStem4 },
];

console.log('=== GENERATING 4 SYNCHRONOUS MIDI STEMS FOR "NEON SYNTHWAVE" ===\n');

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

console.log('All 4 Neon Synthwave MIDI stems have been successfully generated and verified!');
