const config = {
  debug: false,
  flicker: true,
  baseAlphaMultiplier: 2,
  lineWidth: 3.5,
  autoSolve: false,
  minWorthwhileErrorImprovement: 0.05,
  masterSideAttacherColor: 'rgb(255,165,0)',
  instanceSideAttacherColor: 'rgb(255,222,33)',
  axisColor: 'rgba(255,222,33,0.125)',
  handleRadius: 5,
  closeEnough: 5,
  crosshairsSize: 15,
  fontScale: 10,
  kerning: 0.5,
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
  },
};

(window as any).config = config;

export default config;
