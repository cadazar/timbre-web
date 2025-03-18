import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Mic, Save, Loader2 } from "lucide-react";

// Types for the tuner state and temperament
type Note = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";
type Temperament = Record<Note, number>;
type Preset = { name: string; temperament: Temperament; a4: number };

const DEFAULT_TEMPERAMENT: Temperament = {
  C: 0, "C#": 0, D: 0, "D#": 0, E: 0, F: 0, "F#": 0, G: 0, "G#": 0, A: 0, "A#": 0, B: 0,
};

// Audio context and pitch detection utilities
const getPitchFromFrequency = (freq: number, a4: number): { note: Note; cents: number } => {
  const noteNames: Note[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const semitonesFromA4 = 12 * Math.log2(freq / a4);
  const noteIndex = Math.round(semitonesFromA4) % 12;
  const cents = Math.round(1200 * Math.log2(freq / (a4 * Math.pow(2, noteIndex / 12))));
  return { note: noteNames[noteIndex < 0 ? noteIndex + 12 : noteIndex], cents };
};

const Tuner: React.FC = () => {
  // State management
  const [isActive, setIsActive] = useState(false);
  const [frequency, setFrequency] = useState<number | null>(null);
  const [a4, setA4] = useState(440);
  const [temperament, setTemperament] = useState<Temperament>(DEFAULT_TEMPERAMENT);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Load presets from localStorage on mount
  useEffect(() => {
    const savedPresets = localStorage.getItem("tunerPresets");
    if (savedPresets) setPresets(JSON.parse(savedPresets));
  }, []);

  // Audio processing setup
  const startTuner = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      source.connect(analyser);
      analyser.fftSize = 2048;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);

      const detectPitch = () => {
        analyser.getFloatTimeDomainData(dataArray);
        const pitch = autoCorrelate(dataArray, audioContext.sampleRate);
        if (pitch > 30 && pitch < 2500) setFrequency(pitch);
        if (isActive) requestAnimationFrame(detectPitch);
      };

      setIsActive(true);
      detectPitch();
    } catch (err) {
      setError("Microphone access denied. Please allow microphone permissions.");
    }
  }, [isActive]);

  // Stop tuner when component unmounts or button is toggled off
  useEffect(() => {
    return () => setIsActive(false);
  }, []);

  // Pitch detection algorithm (autocorrelation)
  const autoCorrelate = (buf: Float32Array, sampleRate: number): number => {
    let size = buf.length;
    let rms = 0;
    for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / size);
    if (rms < 0.01) return -1; // Not enough signal

    let r1 = 0, r2 = size - 1;
    const threshold = 0.2;
    for (let i = 0; i < size / 2; i++)
      if (Math.abs(buf[i]) < threshold) { r1 = i; break; }
    for (let i = 1; i < size / 2; i++)
      if (Math.abs(buf[size - i]) < threshold) { r2 = size - i; break; }

    const buf2 = buf.slice(r1, r2);
    size = buf2.length;
    const c = new Float32Array(size);
    for (let i = 0; i < size; i++)
      for (let j = 0; j < size - i; j++)
        c[i] = c[i] + buf2[j] * buf2[j + i];

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < size; i++) {
      if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    let T0 = maxpos;

    return sampleRate / T0;
  };

  // Calculate current note and deviation
  const { note, cents } = useMemo(() => {
    if (!frequency) return { note: null, cents: 0 };
    const { note, cents } = getPitchFromFrequency(frequency, a4);
    const adjustedCents = cents - (temperament[note] || 0);
    return { note, cents: adjustedCents };
  }, [frequency, a4, temperament]);

  // Save preset handler
  const savePreset = () => {
    if (!presetName) return;
    const newPresets = [...presets, { name: presetName, temperament, a4 }];
    setPresets(newPresets);
    localStorage.setItem("tunerPresets", JSON.stringify(newPresets));
    setPresetName("");
  };

  // Load preset handler
  const loadPreset = (preset: Preset) => {
    setTemperament(preset.temperament);
    setA4(preset.a4);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <h1 className="text-2xl md:text-3xl font-bold text-center">Instrument Tuner</h1>

        {/* Main Tuner Display */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex flex-col items-center gap-4">
            <Button
              onClick={() => isActive ? setIsActive(false) : startTuner()}
              className="w-full max-w-xs"
              variant={isActive ? "destructive" : "default"}
            >
              {isActive ? "Stop" : "Start"} <Mic className="ml-2 h-4 w-4" />
            </Button>

            {error && <p className="text-red-500">{error}</p>}

            <div className="w-full max-w-md">
              <div className="text-center">
                <p className="text-4xl font-bold">{note || "-"}</p>
                <p className="text-lg">
                  {frequency ? `${frequency.toFixed(1)} Hz` : "- Hz"}
                </p>
              </div>

              {/* Tuning Meter */}
              <div className="mt-4 relative h-8 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  className={`absolute h-full ${cents >= -5 && cents <= 5 ? "bg-green-500" : "bg-blue-500"}`}
                  style={{ width: "2px", left: "50%" }}
                />
                <motion.div
                  className="absolute h-full w-1 bg-red-500"
                  animate={{ left: `${50 + cents / 2}%` }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
                <div className="absolute inset-0 flex justify-between text-xs px-2">
                  <span>-50</span>
                  <span>0</span>
                  <span>+50</span>
                </div>
              </div>
              <p className="text-center mt-2">Cents: {cents.toFixed(1)}</p>
            </div>
          </div>
        </div>

        {/* A4 Reference Tuning */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Reference Pitch (A4)</h2>
          <div className="flex items-center gap-4">
            <Slider
              min={415}
              max={466}
              step={1}
              value={[a4]}
              onValueChange={([value]) => setA4(value)}
              className="w-full"
            />
            <Input
              type="number"
              value={a4}
              onChange={(e) => setA4(Number(e.target.value))}
              className="w-20"
            />
            <span>Hz</span>
          </div>
        </div>

        {/* Temperament Editor */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Custom Temperament</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(temperament).map(([note, offset]) => (
              <div key={note} className="flex flex-col gap-2">
                <label className="text-sm font-medium">{note}</label>
                <Input
                  type="number"
                  min={-50}
                  max={50}
                  value={offset}
                  onChange={(e) =>
                    setTemperament((prev) => ({
                      ...prev,
                      [note]: Math.max(-50, Math.min(50, Number(e.target.value))),
                    }))
                  }
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Presets */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Presets</h2>
          <div className="flex gap-4 mb-4">
            <Input
              placeholder="Preset name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <Button onClick={savePreset} disabled={!presetName}>
              <Save className="mr-2 h-4 w-4" /> Save
            </Button>
          </div>
          <div className="space-y-2">
            {presets.map((preset, index) => (
              <div key={index} className="flex justify-between items-center">
                <span>{preset.name}</span>
                <Button variant="outline" onClick={() => loadPreset(preset)}>
                  Load
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tuner;