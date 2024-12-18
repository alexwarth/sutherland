export const config = {
  debug: false,
  flicker: false,
  autoSolve: false,
  minWorthwhileErrorImprovement: 0.05,
  masterSideAttacherColor: 'rgb(1,101,252)',
  instanceSideAttacherColor: 'rgb(255,222,33)',
  axisColor: 'rgba(255,222,33,0.125)',
  handleRadius: 5,
  closeEnough: 5,
  crosshairsSize: 15,
};

(window as any).config = config;
