import fs from 'node:fs';
import path from 'node:path';
import MidiWriter from 'midi-writer-js';
import pkg from '@tonejs/midi';
const { Midi } = pkg;

const OUTPUT_DIR = path.resolve('public/audio/packs/organic/midi');
const BPM = 96;
const TIME_SIGNATURE = [4, 4];
const BARS = 16;
const CHORD_PROGRESSION = ['Em', 'C', 'G', 'D']; // 4 bars repeated 4 times = 16 bars

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
 * Stem 1: Low Acoustic Bass / Pizzicato Pluck (Root Notes)
 * - Low notes: E1, C1, G1, D1
 * - Detached notes on strong beats (beat 1 and beat 3)
 * - GM Instrument: 45 (Pizzicato Strings) / 32 (Acoustic Bass)
 * ----------------------------------------------------------------------------
 */
function generateStem1() {
  const track = createTrack('Stem 1 - Pizzicato Double Bass', 45);

  const bassRoots = {
    Em: 'E1',
    C: 'C1',
    G: 'G1',
    D: 'D1',
  };

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const root = bassRoots[chord];

    // Beat 1: Strong downbeat pluck (beats 1-2)
    track.addEvent(
      new MidiWriter.NoteEvent({
        pitch: [root],
        duration: '2',
        velocity: 84,
      })
    );

    // Beat 3: Secondary strong beat pluck (beats 3-4)
    track.addEvent(
      new MidiWriter.NoteEvent({
        pitch: [root],
        duration: '2',
        velocity: 74,
      })
    );
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 2: Wooden Harmony / Marimba Rhythm
 * - Soft short chord staccato in octave 3-4:
 *   Em: G3 - B3 - E4
 *   C:  G3 - C4 - E4
 *   G:  G3 - B3 - D4
 *   D:  F#3 - A3 - D4
 * - Organic acoustic wooden pulse with syncopated eighth-note bounce
 * - GM Instrument: 12 (Marimba)
 * ----------------------------------------------------------------------------
 */
function generateStem2() {
  const track = createTrack('Stem 2 - Marimba Wooden Chords', 12);

  const chordVoicings = {
    Em: ['G3', 'B3', 'E4'],
    C: ['G3', 'C4', 'E4'],
    G: ['G3', 'B3', 'D4'],
    D: ['F#3', 'A3', 'D4'],
  };

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORD_PROGRESSION[bar % 4];
    const pitches = chordVoicings[chord];

    // Beat 1: Quarter note downbeat (vel 74)
    track.addEvent(new MidiWriter.NoteEvent({ pitch: pitches, duration: '4', velocity: 74 }));
    // Beat 2: Quarter note (vel 58)
    track.addEvent(new MidiWriter.NoteEvent({ pitch: pitches, duration: '4', velocity: 58 }));
    // Beat 3: Eighth note (vel 68)
    track.addEvent(new MidiWriter.NoteEvent({ pitch: pitches, duration: '8', velocity: 68 }));
    // Beat 3.5: Eighth note syncopation (vel 62)
    track.addEvent(new MidiWriter.NoteEvent({ pitch: pitches, duration: '8', velocity: 62 }));
    // Beat 4: Quarter note (vel 60)
    track.addEvent(new MidiWriter.NoteEvent({ pitch: pitches, duration: '4', velocity: 60 }));
  }

  const writer = new MidiWriter.Writer(track);
  return Buffer.from(writer.buildFile());
}

/**
 * ----------------------------------------------------------------------------
 * Stem 3: Kalimba / Fast Pentatonic Arpeggio
 * - Continuous light 16th-note arpeggios based on E-minor pentatonic in octave 4-5
 * - 16 sixteenth-notes per bar (256 notes across 16 bars)
 * - GM Instrument: 108 (Kalimba)
 * ----------------------------------------------------------------------------
 */
function generateStem3() {
  const track = createTrack('Stem 3 - Kalimba Pentatonic Arpeggio', 108);

  const patterns = {
    Em: ['E4', 'G4', 'B4', 'D5', 'E5', 'D5', 'B4', 'G4', 'E4', 'G4', 'B4', 'D5', 'E5', 'D5', 'B4', 'G4'],
    C:  ['E4', 'G4', 'A4', 'C5', 'E5', 'C5', 'A4', 'G4', 'E4', 'G4', 'A4', 'C5', 'E5', 'C5', 'A4', 'G4'],
    G:  ['D4', 'G4', 'B4', 'D5', 'G5', 'D5', 'B4', 'G4', 'D4', 'G4', 'B4', 'D5', 'G5', 'D5', 'B4', 'G4'],
    D:  ['D4', 'F#4', 'A4', 'D5', 'E5', 'D5', 'A4', 'F#4', 'D4', 'F#4', 'A4', 'D5', 'E5', 'D5', 'A4', 'F#4'],
  };

  // Organic thumb-piano velocity curve per beat
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
          duration: '16',
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
 * Stem 4: Wind Chimes / Glockenspiel (High Crystal Accents)
 * - Rare high notes in 6th octave sounding like sparkling dewdrops / wind chimes
 * - Strictly placed on strong beats (downbeats and secondary strong beats)
 * - Sustaining across measures to conclude mathematically at 40.000s
 * - GM Instrument: 9 (Glockenspiel)
 * ----------------------------------------------------------------------------
 */
function generateStem4() {
  const track = createTrack('Stem 4 - Wind Chimes & Glockenspiel', 9);

  // 16 bars with crystalline dewdrop accents in 6th octave
  const chimeAccents = [
    // Cycle 1 (Bars 1-4)
    { bar: 1,  notes: [{ pitch: 'E6', duration: '1', vel: 85 }] },
    { bar: 2,  notes: [{ pitch: 'G6', duration: '1', vel: 82 }] },
    { bar: 3,  notes: [{ pitch: 'B6', duration: '2', vel: 84 }, { pitch: 'G6', duration: '2', vel: 78 }] },
    { bar: 4,  notes: [{ pitch: 'D6', duration: '1', vel: 80 }] },

    // Cycle 2 (Bars 5-8)
    { bar: 5,  notes: [{ pitch: 'B6', duration: '1', vel: 86 }] },
    { bar: 6,  notes: [{ pitch: 'E6', duration: '1', vel: 82 }] },
    { bar: 7,  notes: [{ pitch: 'D6', duration: '2', vel: 85 }, { pitch: 'B6', duration: '2', vel: 78 }] },
    { bar: 8,  notes: [{ pitch: 'A6', duration: '1', vel: 80 }] },

    // Cycle 3 (Bars 9-12)
    { bar: 9,  notes: [{ pitch: 'G6', duration: '2', vel: 86 }, { pitch: 'E6', duration: '2', vel: 80 }] },
    { bar: 10, notes: [{ pitch: 'C6', duration: '1', vel: 84 }] },
    { bar: 11, notes: [{ pitch: 'D6', duration: '2', vel: 86 }, { pitch: 'G6', duration: '2', vel: 80 }] },
    { bar: 12, notes: [{ pitch: 'F#6', duration: '1', vel: 80 }] },

    // Cycle 4 (Bars 13-16)
    { bar: 13, notes: [{ pitch: 'E6', duration: '1', vel: 86 }] },
    { bar: 14, notes: [{ pitch: 'G6', duration: '1', vel: 82 }] },
    { bar: 15, notes: [{ pitch: 'B6', duration: '2', vel: 84 }, { pitch: 'D6', duration: '2', vel: 78 }] },
    { bar: 16, notes: [{ pitch: 'E6', duration: '1', vel: 84 }] },
  ];

  for (const barConfig of chimeAccents) {
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
  { name: 'stem-1.mid', title: 'Stem 1 (Pizzicato Double Bass)', fn: generateStem1 },
  { name: 'stem-2.mid', title: 'Stem 2 (Marimba Wooden Chords)', fn: generateStem2 },
  { name: 'stem-3.mid', title: 'Stem 3 (Kalimba Pentatonic Arpeggio)', fn: generateStem3 },
  { name: 'stem-4.mid', title: 'Stem 4 (Wind Chimes & Glockenspiel)', fn: generateStem4 },
];

console.log('=== GENERATING 4 SYNCHRONOUS MIDI STEMS FOR "ORGANIC FOREST" ===\n');

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

console.log('All 4 Organic Forest MIDI stems have been successfully generated and verified!');
