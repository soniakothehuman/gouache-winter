export type SnowLevel = number

declare module 'claude-code' {
  interface PluginState {
    'gouache-winter': { snowLevel: SnowLevel }
  }
}
