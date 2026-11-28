import { Config } from '@remotion/cli/config'
import { webpackOverride } from './webpack-override.mjs'

Config.setVideoImageFormat('jpeg')
Config.setCodec('h264')
Config.overrideWebpackConfig(webpackOverride)
