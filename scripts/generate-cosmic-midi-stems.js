import fs from 'node:fs';
import path from 'node:path';
import MidiWriter from 'midi-writer-js';
import pkg from '@tonejs/midi';
const { Midi } = pkg;

const OUTPUT_DIR = path.resolve('public/audio/packs/cosmic/midi');
const BPM = 96;
const TIME_SIGNATURE = [4, 4];
const BARS = 16;
const CHORD_PROGRESSION = ['Bm', 'G', 'D', 'A']; // 4 bars repeated 4 times = 16 bars

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
 * Stem 1: Sub Drone Bass (Gravity Layer)
 * - Deep sub-bass notes: B0, G0, D1, A0
 * - Sustained whole notes creating gravitational drone pull
 * - GM Instrument: 38 (Synth Bass 1)
 * ----------------------------------------------------------------------------
 */
function generateStem1() {
  const track = createTrack('Stem 1 - Sub Drone Bass', 38);

  const bassRoots = {
    Bm: 'B0',
    G: 'G0',
    D: 'D1',
    A: 'A0',
  };

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const root = bassRoots[chord];

    track.addEvent(
      new MidiWriter.NoteEvent({
        pitch: [root],
        duration: '1', // 1 whole note (sustained drone)
        velocity: 78,
      })
    );
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 2: Rhodes Electric Piano Chords
 * - Warm jazz Rhodes chords in octave 3-4:
 *   Bm: B3 - D4 - F#4
 *   G:  B3 - D4 - G4
 *   D:  A3 - D4 - F#4
 *   A:  A3 - C#4 - E4
 * - Quarter-note pulse with soft tremolo velocity dynamics
 * - GM Instrument: 4 (Electric Piano 1 - Rhodes)
 * ----------------------------------------------------------------------------
 */
function generateStem2() {
  const track = createTrack('Stem 2 - Rhodes Tremolo Chords', 4);

  const chordVoicings = {
    Bm: ['B3', 'D4', 'F#4'],
    G: ['B3', 'D4', 'G4'],
    D: ['A3', 'D4', 'F#4'],
    A: ['A3', 'C#4', 'E4'],
  };

  // Soft tremolo velocity curve across 4 quarter notes
  const tremoloVelocities = [68, 56, 65, 58];

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const pitches = chordVoicings[chord];

    for (let quarter = 0; quarter < 4; quarter++) {
      track.addEvent(
        new MidiWriter.NoteEvent({
          pitch: pitches,
          duration: '4',
          velocity: tremoloVelocities[quarter],
        })
      );
    }
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 3: Crystal Bell Arpeggio
 * - Sparkling glass bell arpeggios in octave 4-5 rippling in waves
 * - 16 sixteenth notes per bar (256 notes across 16 bars)
 * - GM Instrument: 98 (FX 3 - Crystal)
 * ----------------------------------------------------------------------------
 */
function generateStem3() {
  const track = createTrack('Stem 3 - Crystal Bell Arpeggio', 98);

  const patterns = {
    Bm: ['F#4', 'B4', 'D5', 'F#5', 'D5', 'B4', 'D5', 'F#5', 'F#4', 'B4', 'D5', 'F#5', 'D5', 'B4', 'D5', 'B4'],
    G:  ['G4', 'B4', 'D5', 'G5', 'D5', 'B4', 'D5', 'G5', 'G4', 'B4', 'D5', 'G5', 'D5', 'B4', 'D5', 'B4'],
    D:  ['F#4', 'A4', 'D5', 'F#5', 'D5', 'A4', 'D5', 'F#5', 'F#4', 'A4', 'D5', 'F#5', 'D5', 'A4', 'D5', 'A4'],
    A:  ['E4', 'A4', 'C#5', 'E5', 'C#5', 'A4', 'C#5', 'E5', 'E4', 'A4', 'C#5', 'E5', 'C#5', 'A4', 'C#5', 'A4'],
  };

  const waveVelocities = [
    74, 58, 65, 60, // Beat 1
    70, 58, 65, 60, // Beat 2
    72, 58, 65, 60, // Beat 3
    70, 58, 65, 58, // Beat 4
  ];

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const notes = patterns[chord];

    for (let step = 0; step < 16; step++) {
      track.addEvent(
        new MidiWriter.NoteEvent({
          pitch: [notes[step]],
          duration: '16',
          velocity: waveVelocities[step],
        })
      );
    }
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 4: Vibraphone / Cosmic Lead Signal
 * - Rare single notes in 5-6th octave with long celestial sustain
 * - Concludes at exactly 40.000s
 * - GM Instrument: 11 (Vibraphone)
 * ----------------------------------------------------------------------------
 */
function generateStem4() {
  const track = createTrack('Stem 4 - Vibraphone Cosmic Beacon', 11);

  const vibePhrases = [
    // Cycle 1 (Bars 1-4): Cosmic beacon awakening
    [{ p: 'F#5', d: '1', v: 84 }],
    [{ p: 'D6',  d: '1', v: 82 }],
    [{ p: 'A5',  d: '1', v: 80 }],
    [{ p: 'C#6', d: '1', v: 82 }],

    // Cycle 2 (Bars 5-8): Reaching higher into the cosmos
    [{ p: 'B5',  d: '1', v: 86 }],
    [{ p: 'G6',  d: '1', v: 85 }],
    [{ p: 'F#6', d: '1', v: 84 }],
    [{ p: 'E6',  d: '1', v: 80 }],

    // Cycle 3 (Bars 9-12): Constellation motif
    [{ p: 'D6', d: '2', v: 84 }, { p: 'F#6', d: '2', v: 82 }],
    [{ p: 'B6', d: '1', v: 86 }],
    [{ p: 'A6', d: '1', v: 85 }],
    [{ p: 'E6', d: '2', v: 82 }, { p: 'C#6', d: '2', v: 80 }],

    // Cycle 4 (Bars 13-16): Gravitational descent and final B5 sustain
    [{ p: 'F#5', d: '1', v: 84 }],
    [{ p: 'G5',  d: '1', v: 82 }],
    [{ p: 'A5',  d: '1', v: 82 }],
    [{ p: 'B5',  d: '1', v: 88 }], // Deep resonant root resolution to B5 ending at 40.000s
  ];

  for (const barNotes of vibePhrases) {
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
  { name: 'stem-1.mid', title: 'Stem 1 (Sub Drone Bass)', fn: generateStem1 },
  { name: 'stem-2.mid', title: 'Stem 2 (Rhodes Tremolo Chords)', fn: generateStem2 },
  { name: 'stem-3.mid', title: 'Stem 3 (Crystal Bell Arpeggio)', fn: generateStem3 },
  { name: 'stem-4.mid', title: 'Stem 4 (Vibraphone Cosmic Beacon)', fn: generateStem4 },
];

console.log('=== GENERATING 4 SYNCHRONOUS MIDI STEMS FOR "COSMIC GLASS" ===\n');

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

console.log('All 4 Cosmic Glass MIDI stems have been successfully generated and verified!');
