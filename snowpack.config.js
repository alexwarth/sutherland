module.exports = {
  mount: {
    src: '/',
  },
  devOptions: {
    open: 'none',
    sourcemap: true,
  },
  buildOptions: {
    sourcemap: false,
  },
  optimize: {
    bundle: true,
    minify: false,
  },
};
