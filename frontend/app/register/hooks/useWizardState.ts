"use client";

import { useState, useCallback, useMemo } from "react";

export type WizardStep = "model" | "style" | "theme" | "prompt" | "generate";

export interface DomainInfo {
  subdomain: string;
  tld: string;
  fqdn: string;
  available: boolean;
  tier?: string;
  priceUSD?: number;
  priceFLR?: number;
}

export interface WizardState {
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;

  // Selections
  model: "playground" | "animagine" | null;
  artStyleId: string | null;
  selectedThemes: string[]; // max 5
  prompt: string;

  // Domain (from search)
  domain: DomainInfo | null;
}

const STEP_ORDER: WizardStep[] = ["model", "style", "theme", "prompt", "generate"];

const initialState: WizardState = {
  currentStep: "model",
  completedSteps: new Set(),
  model: null,
  artStyleId: null,
  selectedThemes: [],
  prompt: "",
  domain: null,
};

export function useWizardState() {
  const [state, setState] = useState<WizardState>(initialState);

  const setModel = useCallback((model: "playground" | "animagine") => {
    setState((prev) => ({
      ...prev,
      model,
      // Clear themes when switching models since anime/photorealistic themes don't overlap
      selectedThemes: prev.model !== model ? [] : prev.selectedThemes,
      completedSteps: new Set([...prev.completedSteps, "model"]),
      currentStep: "style",
    }));
  }, []);

  const setArtStyle = useCallback((styleId: string | null) => {
    setState((prev) => ({
      ...prev,
      artStyleId: styleId,
      completedSteps: new Set([...prev.completedSteps, "style"]),
      currentStep: "theme",
    }));
  }, []);

  const skipArtStyle = useCallback(() => {
    setState((prev) => ({
      ...prev,
      artStyleId: null,
      completedSteps: new Set([...prev.completedSteps, "style"]),
      currentStep: "theme",
    }));
  }, []);

  const toggleTheme = useCallback((themeId: string) => {
    setState((prev) => {
      const themes = prev.selectedThemes.includes(themeId)
        ? prev.selectedThemes.filter((id) => id !== themeId)
        : prev.selectedThemes.length < 5
          ? [...prev.selectedThemes, themeId]
          : [...prev.selectedThemes.slice(1), themeId]; // Replace oldest
      return { ...prev, selectedThemes: themes };
    });
  }, []);

  const setSelectedThemes = useCallback((themes: string[]) => {
    setState((prev) => ({
      ...prev,
      selectedThemes: themes.slice(0, 5),
    }));
  }, []);

  const confirmThemes = useCallback(() => {
    setState((prev) => {
      if (prev.selectedThemes.length !== 5) return prev;

      // If prompt was already completed, skip to generate
      const nextStep = prev.completedSteps.has("prompt") ? "generate" : "prompt";

      return {
        ...prev,
        completedSteps: new Set([...prev.completedSteps, "theme"]),
        currentStep: nextStep,
      };
    });
  }, []);

  const setPrompt = useCallback((prompt: string) => {
    setState((prev) => ({ ...prev, prompt }));
  }, []);

  const confirmPrompt = useCallback(() => {
    setState((prev) => ({
      ...prev,
      completedSteps: new Set([...prev.completedSteps, "prompt"]),
      currentStep: "generate",
    }));
  }, []);

  const goBack = useCallback(() => {
    setState((prev) => {
      const currentIndex = STEP_ORDER.indexOf(prev.currentStep);
      if (currentIndex <= 0) return prev;

      const prevStep = STEP_ORDER[currentIndex - 1];
      const newCompletedSteps = new Set(
        [...prev.completedSteps].filter(
          (s) => STEP_ORDER.indexOf(s) < currentIndex - 1
        )
      );

      return {
        ...prev,
        currentStep: prevStep,
        completedSteps: newCompletedSteps,
      };
    });
  }, []);

  const goToStep = useCallback((step: WizardStep) => {
    setState((prev) => {
      const targetIndex = STEP_ORDER.indexOf(step);
      const currentIndex = STEP_ORDER.indexOf(prev.currentStep);

      // Can only go to completed steps or current step
      if (targetIndex > currentIndex && !prev.completedSteps.has(step)) {
        return prev;
      }

      return { ...prev, currentStep: step };
    });
  }, []);

  const setDomain = useCallback((domain: DomainInfo | null) => {
    setState((prev) => ({ ...prev, domain }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const resetForNewGeneration = useCallback(() => {
    // Keep model, style, themes, prompt selections but allow new generation
    setState((prev) => ({
      ...prev,
      currentStep: "generate",
      completedSteps: new Set([...prev.completedSteps, "model", "style", "theme", "prompt"]),
    }));
  }, []);

  // Restore full wizard state (for session resumption)
  const restoreState = useCallback((partial: {
    model?: "playground" | "animagine" | null;
    artStyleId?: string | null;
    selectedThemes?: string[];
    prompt?: string;
    domain?: DomainInfo | null;
    currentStep?: WizardStep;
  }) => {
    setState((prev) => {
      const newState = { ...prev };

      if (partial.model !== undefined) newState.model = partial.model;
      if (partial.artStyleId !== undefined) newState.artStyleId = partial.artStyleId;
      if (partial.selectedThemes !== undefined) newState.selectedThemes = partial.selectedThemes;
      if (partial.prompt !== undefined) newState.prompt = partial.prompt;
      if (partial.domain !== undefined) newState.domain = partial.domain;

      // Mark steps as complete based on data
      const completed = new Set<WizardStep>();
      if (newState.model) completed.add("model");
      if (newState.model) completed.add("style"); // Style is optional, so complete if model is set
      if (newState.selectedThemes.length === 5) completed.add("theme");
      if (newState.selectedThemes.length === 5) completed.add("prompt"); // Prompt is optional

      newState.completedSteps = completed;
      newState.currentStep = partial.currentStep || (completed.size >= 4 ? "generate" : prev.currentStep);

      return newState;
    });
  }, []);

  const canGenerate = useMemo(() => {
    return (
      state.model !== null &&
      state.selectedThemes.length === 5 &&
      state.domain?.available === true
    );
  }, [state.model, state.selectedThemes.length, state.domain?.available]);

  const isStepCompleted = useCallback(
    (step: WizardStep) => state.completedSteps.has(step),
    [state.completedSteps]
  );

  const isStepActive = useCallback(
    (step: WizardStep) => state.currentStep === step,
    [state.currentStep]
  );

  const isStepAccessible = useCallback(
    (step: WizardStep) => {
      const stepIndex = STEP_ORDER.indexOf(step);
      const currentIndex = STEP_ORDER.indexOf(state.currentStep);
      return stepIndex <= currentIndex || state.completedSteps.has(step);
    },
    [state.currentStep, state.completedSteps]
  );

  const getStepSummary = useCallback(
    (step: WizardStep): string => {
      switch (step) {
        case "model":
          return state.model === "playground"
            ? "SDXL Playground"
            : state.model === "animagine"
              ? "Animagine"
              : "Not selected";
        case "style":
          return state.artStyleId || "No style";
        case "theme":
          return `${state.selectedThemes.length}/5 themes`;
        case "prompt":
          return state.prompt
            ? state.prompt.slice(0, 30) + (state.prompt.length > 30 ? "..." : "")
            : "Using defaults";
        case "generate":
          return "Ready to generate";
        default:
          return "";
      }
    },
    [state.model, state.artStyleId, state.selectedThemes.length, state.prompt]
  );

  return {
    state,
    // Actions
    setModel,
    setArtStyle,
    skipArtStyle,
    toggleTheme,
    setSelectedThemes,
    confirmThemes,
    setPrompt,
    confirmPrompt,
    goBack,
    goToStep,
    setDomain,
    reset,
    resetForNewGeneration,
    restoreState,
    // Computed
    canGenerate,
    isStepCompleted,
    isStepActive,
    isStepAccessible,
    getStepSummary,
    stepOrder: STEP_ORDER,
  };
}
