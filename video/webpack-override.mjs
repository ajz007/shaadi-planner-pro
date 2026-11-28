// The video project imports the planner's shared invitation art from
// ../web/src. Pin React to this project's copy so those files don't pick up
// a second React from web/node_modules. Paths resolve from the video folder,
// where the npm scripts run.
import path from 'node:path'

export const webpackOverride = config => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias ?? {}),
      react: path.resolve('node_modules/react'),
      'react-dom': path.resolve('node_modules/react-dom'),
    },
  },
})
