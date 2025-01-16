const defaultConfig = {
  debug: false,
  flicker: true,
  baseAlphaMultiplier: 1.5,
  lineWidth: 3.5,
  autoSolve: false,
  minWorthwhileErrorImprovement: 0.05,
  masterSideAttacherColor: 'rgb(255,165,0)',
  instanceSideAttacherColor: 'rgb(255,222,33)',
  axisColor: 'rgba(255,222,33,0.125)',
  handleRadius: 7,
  closeEnough: 7,
  crosshairsSize: 15,
  fontScale: 10,
  kerning: 0.75,
  showGuideLines: false,
  guideLineColor: 'rgba(255,255,255,.125)',
  statusTimeMillis: 4_000,
  usePredictedEvents: false,
  weight: 25,
  distanceConstraintTextScale: 0.3,
  distanceConstraintLabelPct: 0.25,
  showImplicitConstraints: false,
  tablet: {
    buttonWidth: 100,
    lefty: false,
  },
};

let _config = defaultConfig;

export function loadConfig() {
  _config = JSON.parse(localStorage.getItem('config') ?? JSON.stringify(defaultConfig));
}

export function saveConfig() {
  localStorage.setItem('config', JSON.stringify(_config));
}

export function restoreDefaultConfig() {
  _config = defaultConfig;
  saveConfig();
}

export default function config() {
  return _config;
}

loadConfig();
