const defaultConfig = {
  debug: false,
  flicker: true,
  baseAlphaMultiplier: 1.5,
  lineWidth: 3.5,
  autoSolve: false,
  minWorthwhileErrorImprovement: 0.05,
  masterSideAttacherColor: 'rgb(255,165,0)',
  instanceSideAttacherColor: 'rgb(255,222,33)',
  showControlPoints: true,
  controlPointColor: 'rgba(255,222,33,.2)',
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
  highlightReferents: true,
  maxDepth: 10,
  tabletButtonWidth: 100,
  lefty: false,
  onionSkinAlpha: 0.5,
};

export type Config = typeof defaultConfig;

let _config: Config;

export function loadConfig() {
  _config = JSON.parse(localStorage.getItem('config') ?? JSON.stringify(defaultConfig));
  // fill in missing properties (this is important for code updates that add new properties)
  for (const [key, value] of Object.entries(defaultConfig)) {
    if (!Object.hasOwn(_config, key)) {
      _config[key] = value;
    }
  }
}

export function updateConfig(updates: Partial<Config>) {
  _config = { ..._config, ...updates };
  localStorage.setItem(
    'config',
    JSON.stringify({ ...JSON.parse(localStorage.getItem('config')!), ...updates }),
  );
}

export function restoreDefaultConfig() {
  _config = JSON.parse(JSON.stringify(defaultConfig));
  localStorage.setItem('config', JSON.stringify(_config));
}

export default function config() {
  return _config;
}

loadConfig();

(window as any).config = config;
