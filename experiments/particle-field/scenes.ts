// Scenes and vibes: the ready-made recipes. Pure data.
import { DEFAULTS, type Settings } from './settings.ts';

export const PRESETS: [string, Partial<Settings>][] = [
  ['Drift', { ...DEFAULTS }],
  ['Silk', { count: 3000, size: 1, render: 'streaks', flow: 1, flowScale: 0.003, flowSpeed: 0.15, trail: 0.95, friction: 0.06, jitter: 0.01, palette: 'ocean', colorBy: 'direction', glow: true, pointerMode: 'vortex', radius: 180, force: 0.5 }],
  ['Embers', { count: 1500, size: 2.2, render: 'dots', flow: 0.5, flowScale: 0.008, flowSpeed: 0.6, trail: 0.85, friction: 0.03, jitter: 0.15, palette: 'ember', colorBy: 'speed', glow: true, pointerMode: 'repel', radius: 150, force: 1, click: 'emit' }],
  ['Constellation', { count: 500, size: 2, render: 'links', linkDist: 90, flow: 0.1, flowSpeed: 0.1, trail: 0, friction: 0.02, jitter: 0.04, palette: 'blueprint', colorBy: 'palette', glow: false, pointerMode: 'attract', radius: 200, force: 0.3, click: 'ripple' }],
  ['Neon storm', { count: 4000, size: 1.2, render: 'streaks', flow: 1.6, flowScale: 0.012, flowSpeed: 1, trail: 0.7, friction: 0.05, jitter: 0.05, speed: 1.6, palette: 'neon', colorBy: 'speed', glow: true, pointerMode: 'vortex', radius: 220, force: 1.2, click: 'shockwave' }],
  ['Dusk', { count: 2200, size: 1.3, render: 'streaks', flow: 0.7, flowScale: 0.004, flowSpeed: 0.25, trail: 0.92, friction: 0.05, jitter: 0.02, palette: 'sunset', colorBy: 'vertical', glow: true, pointerMode: 'vortex', radius: 160, force: 0.7 }],
  ['Heat', { count: 3500, size: 2, render: 'dots', flow: 0.4, flowScale: 0.006, flowSpeed: 0.3, trail: 0.85, friction: 0.04, jitter: 0.03, palette: 'infra', colorBy: 'pointer', glow: true, pointerMode: 'attract', radius: 160, force: 0.5, click: 'implode' }],
  ['Fireflies', { lifespan: 5, lifeFade: 'swell', count: 400, size: 1.6, render: 'glow', flow: 0.3, flowScale: 0.003, flowSpeed: 0.1, trail: 0.6, friction: 0.05, jitter: 0.08, palette: 'gold', colorBy: 'palette', glow: true, pointerMode: 'attract', radius: 220, force: 0.3, click: 'gather' }],
  ['Bokeh', { lifespan: 9, lifeFade: 'swell', lifeSize: 'grow', sizeVar: 0.5, count: 250, size: 3, render: 'bokeh', flow: 0.2, flowScale: 0.002, flowSpeed: 0.08, trail: 0, friction: 0.04, jitter: 0.02, palette: 'candy', colorBy: 'palette', glow: true, pointerMode: 'repel', radius: 200, force: 0.3, click: 'ripple' }],
  ['Confetti', { count: 700, size: 3.2, render: 'mixed', mixStyles: 'circles,sparkles,rings,arrows,glyphs', glyphSet: 'shapes', flow: 0.3, flowScale: 0.004, flowSpeed: 0.3, gravity: 0.15, trail: 0, friction: 0.04, jitter: 0.06, palette: 'risograph', colorBy: 'palette', glow: false, pointerMode: 'vortex', radius: 180, force: 0.7, click: 'emit' }],
  ['Digital rain', { count: 900, size: 2.4, render: 'glyphs', glyphSet: 'katakana', glyphPick: 'random', glyphChange: 'flicker', glyphRate: 0.02, glyphFont: 'mono', glyphScale: 1, glyphRotate: 'none', gravity: 1, flow: 0, trail: 0.88, friction: 0.03, jitter: 0, speed: 1, palette: 'toxic', colorBy: 'speed', glow: false, pointerMode: 'repel', radius: 120, force: 0.6, click: 'ripple' }],
  ['ASCII', { count: 2500, size: 2, render: 'glyphs', glyphSet: 'density', glyphPick: 'speed', glyphChange: 'fixed', glyphFont: 'mono', glyphScale: 1, glyphRotate: 'none', flow: 0.8, flowScale: 0.004, flowSpeed: 0.3, trail: 0, friction: 0.05, jitter: 0.02, palette: 'mono', colorBy: 'speed', glow: false, pointerMode: 'vortex', radius: 180, force: 0.8, click: 'gather' }],
  ['Compass', { count: 700, size: 2.2, render: 'glyphs', glyphSet: 'arrows', glyphPick: 'heading', glyphFont: 'sans', glyphScale: 1.2, glyphRotate: 'none', flow: 1, flowScale: 0.003, flowSpeed: 0.2, trail: 0.3, friction: 0.05, jitter: 0.01, palette: 'ice', colorBy: 'direction', glow: false, pointerMode: 'vortex', radius: 200, force: 0.6 }],
  ['Ink', { count: 2500, size: 1, render: 'streaks', flow: 1, flowScale: 0.003, flowSpeed: 0.12, trail: 0.96, friction: 0.06, jitter: 0.01, palette: 'paper', colorBy: 'speed', glow: false, pointerMode: 'vortex', radius: 180, force: 0.5, click: 'gather' }],
  ['Snowfall', { count: 1400, size: 3.4, render: 'circles', gravity: 0.25, flow: 0.25, flowScale: 0.002, flowSpeed: 0.1, trail: 0, friction: 0.05, jitter: 0.05, speed: 0.8, palette: 'ice', colorBy: 'palette', glow: false, pointerMode: 'repel', radius: 140, force: 0.5, click: 'ripple' }],
  ['Comet shower', { count: 600, size: 2, render: 'comets', flow: 0.9, flowScale: 0.003, flowSpeed: 0.3, speed: 1.8, trail: 0.5, friction: 0.02, jitter: 0.02, palette: 'cyber', colorBy: 'speed', glow: true, pointerMode: 'vortex', radius: 200, force: 0.8, click: 'shockwave' }],
  ['Galaxy', { count: 3000, size: 1.4, render: 'sparkles', flow: 0.2, flowScale: 0.003, flowSpeed: 0.1, trail: 0.8, friction: 0.03, jitter: 0.02, palette: 'cosmic', colorBy: 'pointer', glow: true, pointerMode: 'vortex', radius: 320, force: 0.9, click: 'gather' }],
  ['Bubbles', { count: 260, size: 5.5, render: 'rings', gravity: -0.15, flow: 0.3, flowScale: 0.003, flowSpeed: 0.1, trail: 0, friction: 0.05, jitter: 0.04, palette: 'pastel', colorBy: 'palette', glow: false, pointerMode: 'repel', radius: 160, force: 0.5, click: 'emit' }],
  ['Campfire', { count: 1300, size: 1.8, sizeVar: 0.5, render: 'glow', emitter: 'point', emitMode: 'steady', emitRate: 0.3, emitX: 0.5, emitY: 0.85, emitOut: false, launchSpeed: 3.5, launchDir: 270, launchSpread: 35, lifespan: 4, lifeFade: 'out', lifeSize: 'shrink', flow: 0.3, flowType: 'waves', flowScale: 0.006, flowSpeed: 0.5, trail: 0.7, friction: 0.03, jitter: 0.1, gravity: -0.2, palette: 'ember', colorBy: 'age', glow: true, pointerMode: 'repel', radius: 120, force: 0.6 }],
  ['Pulse rings', { count: 3000, size: 1.4, render: 'streaks', emitter: 'ring', emitMode: 'burst', burstEvery: 1.6, burstSize: 0.3, emitSize: 60, emitOut: true, launchSpeed: 3, launchSpread: 0, lifespan: 3, lifeFade: 'out', flow: 0.2, flowType: 'curl', trail: 0.8, friction: 0.02, jitter: 0, palette: 'neon', colorBy: 'age', glow: true, pointerMode: 'vortex', radius: 200, force: 0.6 }],
  ['Hello', { count: 4000, size: 1.4, render: 'dots', shape: 'text', shapeText: 'HELLO', shapeSize: 0.8, shapeCycle: 10, flow: 0.6, flowType: 'curl', flowScale: 0.004, flowSpeed: 0.3, trail: 0.75, friction: 0.04, jitter: 0.02, palette: 'aurora', colorBy: 'horizontal', glow: true, pointerMode: 'repel', radius: 120, force: 1, click: 'shockwave' }],
  ['Starlings', { count: 700, size: 2, render: 'arrows', flock: 1, flockAlign: 1.2, flockCohesion: 1, flockSep: 0.8, flockRange: 45, flow: 0.15, flowType: 'curl', flowScale: 0.002, flowSpeed: 0.2, trail: 0.55, friction: 0.01, jitter: 0.06, palette: 'ice', colorBy: 'direction', glow: false, pointerMode: 'repel', radius: 160, force: 1, click: 'shockwave' }],
  ['Silk ribbons', { count: 600, size: 1.6, render: 'ribbons', ribbonLen: 24, flow: 1, flowType: 'curl', flowScale: 0.003, flowSpeed: 0.2, trail: 0, friction: 0.05, jitter: 0.01, palette: 'tealorange', colorBy: 'direction', glow: true, pointerMode: 'vortex', radius: 200, force: 0.7, click: 'ripple' }],
  ['Deep space', { count: 2000, size: 2, render: 'glow', depth: 1, depthParallax: 0.8, flow: 0.2, flowType: 'curl', flowScale: 0.002, flowSpeed: 0.1, speed: 0.8, trail: 0.3, friction: 0.03, jitter: 0.01, wind: 0.15, windDir: 180, palette: 'cosmic', colorBy: 'depth', glow: true, pointerMode: 'repel', radius: 160, force: 0.5, click: 'ripple' }],
  ['Prism', { count: 2500, size: 1.4, render: 'dots', flow: 0.8, flowScale: 0.005, flowSpeed: 0.3, trail: 0.9, friction: 0.04, jitter: 0.02, palette: 'rainbow', colorBy: 'direction', glow: true, pointerMode: 'repel', radius: 140, force: 0.8 }],
  // Newer engine features: obstacles, placed points, home shapes and
  // entrances, line / edge / pointer emitters, bounce and personal space.
  ['Riverstones', { count: 3000, size: 1.2, render: 'streaks', obstacles: 'circles', obsCircles: '0.22,0.35;0.4,0.68;0.58,0.3;0.78,0.62', obsRadius: 65, obsForce: 1.2, obsShow: true, obsPlace: true, flow: 0.4, flowType: 'waves', flowScale: 0.004, flowSpeed: 0.2, wind: 0.35, windDir: 0, edges: 'enter', trail: 0.9, friction: 0.04, jitter: 0.01, palette: 'forest', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'none' }],
  ['Windbreak', { count: 3500, size: 1.1, render: 'streaks', obstacles: 'text', obsText: 'CALM', obsSize: 0.7, obsForce: 1.4, obsShow: false, flow: 0.25, flowType: 'curl', flowScale: 0.003, flowSpeed: 0.2, wind: 0.45, windDir: 0, trail: 0.88, friction: 0.04, jitter: 0.01, palette: 'ocean', colorBy: 'speed', glow: true, pointerMode: 'repel', radius: 120, force: 0.6, click: 'ripple' }],
  ['Orbit', { count: 1800, size: 1.6, render: 'comets', wells: '0.5,0.5,vortex;0.25,0.3,attract;0.75,0.7,attract', wellForce: 1.2, wellRange: 260, showWells: false, flow: 0.1, flowType: 'curl', trail: 0.75, friction: 0.01, jitter: 0.01, palette: 'vapor', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'shockwave' }],
  ['Marquee', { count: 4500, size: 1.3, render: 'dots', shape: 'text', shapeText: 'MARQUEE', shapeSize: 0.85, entrance: 'sweep', entranceTime: 3, depth: 0.6, depthParallax: 0.5, flow: 0.15, flowType: 'curl', flowScale: 0.004, flowSpeed: 0.3, trail: 0.6, friction: 0.04, jitter: 0.02, palette: 'lavender', colorBy: 'cycle', glow: true, pointerMode: 'repel', radius: 110, force: 1, click: 'shockwave' }],
  ['Sunflower', { count: 2600, size: 1.8, render: 'sparkles', shape: 'sunflower', shapeSize: 0.85, entrance: 'centre', entranceTime: 3.5, flow: 0.1, flowType: 'curl', trail: 0.5, friction: 0.04, jitter: 0.01, palette: 'desert', colorBy: 'radial', glow: true, pointerMode: 'vortex', radius: 160, force: 0.8, click: 'ripple' }],
  ['Lattice', { count: 1600, size: 1.6, render: 'links', linkDist: 45, shape: 'grid', shapeSize: 0.9, entrance: 'rain', entranceTime: 3, homeStrength: 1.4, flow: 0, trail: 0, friction: 0.05, jitter: 0, palette: 'cyber', colorBy: 'pointer', glow: true, pointerMode: 'repel', radius: 140, force: 1.4, click: 'shockwave' }],
  ['Halo', { count: 2400, size: 1.5, render: 'glow', shape: 'ring', shapeSize: 0.7, shapeCycle: 8, entrance: 'edges', entranceTime: 2.5, flow: 0.5, flowType: 'curl', flowScale: 0.004, flowSpeed: 0.3, trail: 0.8, friction: 0.04, jitter: 0.02, palette: 'gold', colorBy: 'radial', glow: true, pointerMode: 'attract', radius: 180, force: 0.5, click: 'implode' }],
  ['Waterfall', { count: 2600, size: 1.3, render: 'streaks', emitter: 'line', emitMode: 'steady', emitRate: 0.4, emitX: 0.5, emitY: 0.08, emitSize: 700, emitAngle: 0, emitOut: false, launchSpeed: 1, launchDir: 90, launchSpread: 20, lifespan: 5, lifeFade: 'out', gravity: 1, flow: 0.15, flowType: 'waves', flowScale: 0.006, flowSpeed: 0.4, obstacles: 'circles', obsCircles: '0.35,0.55;0.62,0.72', obsRadius: 55, obsShow: true, trail: 0.85, friction: 0.02, jitter: 0.02, palette: 'ocean', colorBy: 'age', glow: true, pointerMode: 'repel', radius: 100, force: 0.8, click: 'none' }],
  ['Sparkler', { count: 1500, size: 1.4, render: 'sparkles', emitter: 'pointer', emitMode: 'steady', emitRate: 0.5, launchSpeed: 2.5, launchSpread: 360, lifespan: 1.6, lifeFade: 'out', lifeSize: 'shrink', gravity: 0.2, flow: 0.1, trail: 0.6, friction: 0.04, jitter: 0.1, palette: 'ember', colorBy: 'age', glow: true, pointerMode: 'none', click: 'shockwave' }],
  ['Marbles', { count: 300, size: 6, render: 'circles', space: 1, spaceDist: 16, edges: 'bounce', gravity: 0.3, flow: 0, trail: 0, friction: 0.01, jitter: 0.02, palette: 'crimson', colorBy: 'palette', glow: false, pointerMode: 'repel', radius: 140, force: 1.2, click: 'shockwave' }],
  // --- Words ---
  ['Neon sign', { count: 3000, size: 1, render: 'glow', shape: 'text', shapeText: 'OPEN', shapeSize: 0.7, entrance: 'formed', flow: 0.05, flowType: 'curl', trail: 0.5, friction: 0.05, jitter: 0.04, palette: 'neon', colorBy: 'horizontal', glow: true, pointerMode: 'repel', radius: 100, force: 0.8, click: 'ripple' }],
  ['Typewriter', { count: 2500, size: 2.2, render: 'glyphs', glyphSet: 'latin', glyphPick: 'random', glyphChange: 'fixed', glyphFont: 'mono', glyphScale: 1, glyphRotate: 'none', shape: 'text', shapeText: 'TYPEWRITER', shapeSize: 0.9, entrance: 'sweep', entranceTime: 2.5, flow: 0, trail: 0, friction: 0.05, jitter: 0, palette: 'paper', colorBy: 'palette', glow: false, pointerMode: 'repel', radius: 90, force: 0.8, click: 'shockwave' }],
  ['Smoke writing', { count: 5000, size: 1, render: 'dots', shape: 'text', shapeText: 'SMOKE', shapeSize: 0.8, shapeCycle: 6, entrance: 'drift', flow: 1.2, flowType: 'curl', flowScale: 0.004, flowSpeed: 0.4, trail: 0.92, friction: 0.04, jitter: 0.03, palette: 'mono', colorBy: 'speed', glow: true, pointerMode: 'vortex', radius: 160, force: 0.6, click: 'none' }],
  ['Shatter', { count: 4000, size: 1.6, render: 'sparkles', shape: 'text', shapeText: 'SHATTER', shapeSize: 0.85, entrance: 'centre', flow: 0, trail: 0.4, friction: 0.02, jitter: 0, palette: 'ice', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'shockwave', clickForce: 2 }],
  ['Glyph word', { count: 2200, size: 2, render: 'glyphs', glyphSet: 'katakana', glyphPick: 'random', glyphChange: 'flicker', glyphRate: 0.03, glyphFont: 'mono', glyphScale: 1, glyphRotate: 'none', shape: 'text', shapeText: 'MATRIX', shapeSize: 0.85, entrance: 'rain', entranceTime: 3, flow: 0.1, flowType: 'curl', trail: 0.6, friction: 0.05, jitter: 0.01, palette: 'toxic', colorBy: 'speed', glow: false, pointerMode: 'repel', radius: 110, force: 0.8, click: 'ripple' }],
  ['Dot matrix', { count: 3500, size: 1.8, sizeVar: 0, render: 'circles', shape: 'text', shapeText: 'DOTS', shapeSize: 0.75, entrance: 'sweep', entranceTime: 2.5, flow: 0, trail: 0, friction: 0.05, jitter: 0, palette: 'cyber', colorBy: 'horizontal', glow: false, pointerMode: 'repel', radius: 90, force: 1.2, click: 'ripple' }],
  ['Breathing word', { count: 4500, size: 1.4, render: 'glow', shape: 'text', shapeText: 'BREATHE', shapeSize: 0.85, shapeCycle: 7, entrance: 'centre', depth: 0.8, depthParallax: 0.7, flow: 0.4, flowType: 'curl', flowScale: 0.004, flowSpeed: 0.2, trail: 0.7, friction: 0.04, jitter: 0.02, palette: 'lavender', colorBy: 'depth', glow: true, pointerMode: 'repel', radius: 120, force: 0.6, click: 'none' }],
  // --- Patterns ---
  ['Mandala', { count: 3000, size: 1.5, render: 'sparkles', shape: 'sunflower', shapeSize: 0.9, entrance: 'centre', entranceTime: 3, flow: 0, trail: 0.6, friction: 0.04, jitter: 0, palette: 'candy', colorBy: 'cycle', glow: true, pointerMode: 'vortex', radius: 260, force: 1, click: 'ripple' }],
  ['Pond', { count: 1800, size: 2.6, render: 'dots', shape: 'grid', shapeSize: 1, entrance: 'formed', flow: 0, trail: 0.3, friction: 0.04, jitter: 0, palette: 'ocean', colorBy: 'radial', glow: true, pointerMode: 'repel', radius: 100, force: 0.8, click: 'ripple', clickForce: 1.6 }],
  ['Face mesh', { count: 4000, size: 1.5, render: 'dots', shape: 'camera', camMode: 'face', camCentre: true, shapeSize: 0.9, homeStrength: 2, flow: 0, trail: 0.35, friction: 0.12, jitter: 0, palette: 'ice', colorBy: 'speed', glow: true, pointerMode: 'repel', radius: 90, force: 0.8, click: 'shockwave', links: 'mouth>explode;blink>colours;smile>warm;brows>ripple;pucker>gather;wink>look;tilt>roll@1' }],
  ['Glow face', { count: 2500, size: 1.6, render: 'glow', shape: 'camera', camMode: 'features', camCentre: true, shapeSize: 0.9, homeStrength: 2, flow: 0.05, flowType: 'curl', trail: 0.6, friction: 0.12, jitter: 0.01, palette: 'cyber', colorBy: 'palette', glow: true, pointerMode: 'repel', radius: 90, force: 0.8, click: 'ripple', links: 'mouth>explode;blink>colours;smile>warm;brows>ripple;pucker>gather;wink>look;tilt>roll@1' }],
  ['Live sketch', { count: 5000, size: 1.3, render: 'dots', shape: 'camera', camMode: 'edges', camRate: 5, shapeSize: 1, homeStrength: 1.6, flow: 0, trail: 0.2, friction: 0.1, jitter: 0.02, palette: 'paper', colorBy: 'palette', glow: false, pointerMode: 'repel', radius: 90, force: 0.8, click: 'none' }],
  ['Two faces', { count: 4000, size: 1.6, render: 'glow', shape: 'camera', camMode: 'features', camCentre: true, shapeSize: 0.9, flow: 0, trail: 0.5, friction: 0.12, jitter: 0, palette: 'rainbow', colorBy: 'face', glow: true, pointerMode: 'repel', radius: 90, force: 0.8, click: 'ripple', links: 'mouth>explode;blink>colours;smile>warm;brows>ripple;pucker>gather;wink>look;tilt>roll@1' }],
  ['Silhouette', { count: 5000, size: 1.2, render: 'glow', shape: 'camera', camMode: 'body', camRate: 10, shapeSize: 1, flow: 0.15, flowType: 'curl', trail: 0.75, friction: 0.08, jitter: 0.02, palette: 'neon', colorBy: 'cycle', glow: true, pointerMode: 'repel', radius: 100, force: 0.8, click: 'shockwave' }],
  ['Portrait colours', { count: 6000, size: 1.8, render: 'dots', shape: 'camera', camMode: 'face', camCentre: true, shapeSize: 0.9, flow: 0, trail: 0.2, friction: 0.12, jitter: 0, palette: 'mono', colorBy: 'camera', glow: false, pointerMode: 'repel', radius: 80, force: 0.6, click: 'ripple' }],
  ['Deep face', { count: 4500, size: 1.3, render: 'dots', shape: 'camera', camMode: 'mixed', camMix: 0.5, camDepth: true, depth: 0.9, depthParallax: 0.3, camCentre: true, shapeSize: 0.9, flow: 0, trail: 0.4, friction: 0.12, jitter: 0, palette: 'infra', colorBy: 'depth', glow: true, pointerMode: 'repel', radius: 90, force: 0.8, click: 'shockwave', links: 'mouth>explode;blink>colours;smile>warm;brows>ripple;pucker>gather;wink>look;tilt>roll@1' }],
  ['Breath', { count: 3000, size: 1.5, render: 'glow', shape: 'camera', camMode: 'features', camCentre: true, shapeSize: 0.85, flow: 0.2, flowType: 'curl', trail: 0.8, friction: 0.08, jitter: 0.01, palette: 'ice', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'none', links: 'mouth>emit@1;smile>speed@0.8;brows>size@0.6;pucker>gather;tilt>roll@1' }],
  ['Light painting', { count: 8000, size: 1.4, render: 'glow', camHands: 'draw', flow: 0, jitter: 0.002, friction: 0.2, trail: 0.6, renew: 0, palette: 'rainbow', colorBy: 'palette', glow: true, pointerMode: 'none', click: 'none' }],
  ['Smoke drawing', { count: 6000, size: 1.1, render: 'streaks', camHands: 'draw', flow: 0.35, flowType: 'curl', flowScale: 0.003, flowSpeed: 0.1, jitter: 0.01, friction: 0.05, trail: 0.9, renew: 0, palette: 'ice', colorBy: 'palette', glow: true, pointerMode: 'none', click: 'none' }],
  ['Neon graffiti', { count: 5000, size: 2.2, render: 'circles', camHands: 'draw', flow: 0, jitter: 0, friction: 0.3, trail: 0.2, renew: 0, palette: 'neon', colorBy: 'palette', glow: true, pointerMode: 'none', click: 'none' }],
  ['Finger sparks', { count: 2500, size: 1.4, render: 'sparkles', camHands: 'spray', gravity: 1, edges: 'bounce', flow: 0, jitter: 0.02, friction: 0.02, trail: 0.75, renew: 0, palette: 'ember', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'none' }],
  ['Hand magnets', { count: 3000, size: 1.2, render: 'comets', camHands: 'attract', camHandReach: 250, camHandForce: 1.4, flow: 0.2, flowType: 'curl', flowScale: 0.003, flowSpeed: 0.1, trail: 0.85, friction: 0.03, jitter: 0.01, palette: 'cosmic', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'none' }],
  ['Force field', { count: 1800, size: 1.6, render: 'links', linkDist: 45, shape: 'grid', shapeSize: 0.95, camHands: 'repel', camHandReach: 130, camHandForce: 2, flow: 0, trail: 0, friction: 0.06, jitter: 0, palette: 'cyber', colorBy: 'speed', glow: true, pointerMode: 'repel', radius: 120, force: 1.2, click: 'none' }],
  ['Gesture DJ', { count: 3500, size: 1.3, render: 'comets', gestOn: true, twoDist: 'zoom', twoAngle: 'turn', camHands: 'off', flow: 0.5, flowType: 'curl', flowScale: 0.003, flowSpeed: 0.15, trail: 0.88, friction: 0.03, jitter: 0.01, palette: 'neon', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'none', links: 'fist>explode;palm>freeze;point>ripple;thumbUp>save;thumbDown>scatter;victory>colours;love>shockwave' }],
  ['Stretch', { count: 3000, size: 1.5, render: 'glow', shape: 'sunflower', shapeSize: 0.7, homeStrength: 1, gestOn: true, twoDist: 'size', twoAngle: 'hue', flow: 0.1, flowType: 'curl', trail: 0.6, friction: 0.08, jitter: 0, palette: 'aurora', colorBy: 'radial', glow: true, pointerMode: 'none', click: 'none', links: 'fist>gather' }],
  ['Hand skeleton', { count: 3000, size: 1.4, render: 'glow', shape: 'camera', camMode: 'hands', camSnap: 0.8, homeStrength: 2, flow: 0.05, flowType: 'curl', trail: 0.6, friction: 0.1, jitter: 0.01, palette: 'cyber', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'none' }],
  ['Throw', { count: 2500, size: 1.6, render: 'comets', shape: 'grid', shapeSize: 0.85, homeStrength: 0.6, camHands: 'repel', camHandReach: 120, camHandForce: 0.6, flow: 0, trail: 0.8, friction: 0.025, jitter: 0, palette: 'ember', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'none' }],
  ['Finger paint', { count: 9000, size: 1.6, render: 'circles', camHands: 'draw', drawColour: 'finger', drawWidth: true, drawErase: true, flow: 0, jitter: 0, friction: 0.3, trail: 0.3, renew: 0, palette: 'candy', colorBy: 'palette', glow: true, pointerMode: 'none', click: 'none' }],
  ['Flame head', { count: 4500, size: 1.4, render: 'glow', shape: 'camera', camMode: 'features', camCentre: true, shapeSize: 0.75, homeStrength: 2, flow: 0, friction: 0.08, jitter: 0, colorBy: 'palette', glow: true, pointerMode: 'none', click: 'none', maskFx: 'flames', maskShare: 0.45, trail: 0.75, palette: 'ember' }],
  ['Crying rainbow', { count: 4000, size: 1.4, render: 'glow', shape: 'camera', camMode: 'face', camCentre: true, shapeSize: 0.75, homeStrength: 2, flow: 0, friction: 0.08, jitter: 0, colorBy: 'palette', glow: true, pointerMode: 'none', click: 'none', maskFx: 'tears', maskShare: 0.3, trail: 0.7, palette: 'rainbow' }],
  ['Laser eyes', { count: 4000, size: 1.3, render: 'streaks', shape: 'camera', camMode: 'features', camCentre: true, shapeSize: 0.75, homeStrength: 2, flow: 0, friction: 0.08, jitter: 0, colorBy: 'palette', glow: true, pointerMode: 'none', click: 'none', maskFx: 'lasers', maskShare: 0.4, trail: 0.7, palette: 'infra' }],
  ['Wizard beard', { count: 4500, size: 1.3, render: 'glow', shape: 'camera', camMode: 'face', camCentre: true, shapeSize: 0.75, homeStrength: 2, flow: 0, friction: 0.08, jitter: 0, colorBy: 'palette', glow: true, pointerMode: 'none', click: 'none', maskFx: 'beard', maskShare: 0.45, trail: 0.6, palette: 'rainbow' }],
  ['Angel halo', { count: 4000, size: 1.3, render: 'sparkles', shape: 'camera', camMode: 'features', camCentre: true, shapeSize: 0.75, homeStrength: 2, flow: 0, friction: 0.08, jitter: 0, colorBy: 'palette', glow: true, pointerMode: 'none', click: 'none', maskFx: 'halo', maskShare: 0.35, trail: 0.7, palette: 'gold' }],
  ['Crown', { count: 4000, size: 1.3, render: 'sparkles', shape: 'camera', camMode: 'mixed', camCentre: true, shapeSize: 0.75, homeStrength: 2, flow: 0, friction: 0.08, jitter: 0, colorBy: 'palette', glow: true, pointerMode: 'none', click: 'none', maskFx: 'crown', maskShare: 0.35, trail: 0.6, palette: 'gold' }],
  ['Singer', { count: 4500, size: 1.4, render: 'glow', shape: 'camera', camMode: 'features', camCentre: true, shapeSize: 0.75, homeStrength: 2, flow: 0, friction: 0.08, jitter: 0, colorBy: 'palette', glow: true, pointerMode: 'none', click: 'none', voice: true, maskShare: 0.45, trail: 0.75, palette: 'aurora' }],
  ['Eye contact', { count: 3000, size: 1.2, render: 'comets', gaze: 'drift', flow: 0.3, flowType: 'curl', flowScale: 0.003, flowSpeed: 0.1, trail: 0.88, friction: 0.03, jitter: 0.01, palette: 'cosmic', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'none' }],
  ['Dancer', { count: 4000, size: 1.5, render: 'glow', shape: 'camera', camMode: 'pose', camSnap: 0.7, homeStrength: 2, poseOn: true, poseSweep: 1, flow: 0.05, flowType: 'curl', trail: 0.7, friction: 0.08, jitter: 0.01, palette: 'neon', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'none', links: 'jump>explode' }],
  ['Arm sweep', { count: 4000, size: 1.1, render: 'streaks', poseOn: true, poseSweep: 1.6, flow: 0.3, flowType: 'curl', flowScale: 0.003, flowSpeed: 0.1, trail: 0.88, friction: 0.03, jitter: 0.01, palette: 'ocean', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'none', links: 'jump>shockwave' }],
  ['Rain on me', { count: 3500, size: 1.2, render: 'streaks', obstacles: 'body', obsShow: true, obsForce: 1.6, camRate: 10, emitter: 'line', emitMode: 'steady', emitRate: 0.5, emitX: 0.5, emitY: 0.02, emitSize: 2400, emitAngle: 0, emitOut: false, launchSpeed: 1.5, launchDir: 90, launchSpread: 10, lifespan: 4, lifeFade: 'out', gravity: 1, flow: 0, trail: 0.8, friction: 0.01, jitter: 0.02, palette: 'ocean', colorBy: 'age', glow: true, pointerMode: 'none', click: 'none' }],
  ['Twins', { count: 4000, size: 1.4, render: 'glow', shape: 'camera', camMode: 'features', camCentre: true, shapeSize: 0.75, homeStrength: 2, flow: 0, friction: 0.08, jitter: 0, colorBy: 'palette', glow: true, pointerMode: 'none', click: 'none', mirrorWorld: true, trail: 0.6, palette: 'cyber', links: 'mouth>explode;blink>colours;smile>warm;brows>ripple;pucker>gather;wink>look;tilt>roll@1' }],
  ['Hand play', { count: 3500, size: 1.4, render: 'glow', shape: 'text', shapeText: 'HANDS', camHands: 'repel', camHandReach: 170, camHandForce: 1.4, flow: 0, trail: 0.6, friction: 0.08, jitter: 0.01, palette: 'cyber', colorBy: 'speed', glow: true, pointerMode: 'repel', radius: 120, force: 1, click: 'shockwave' }],
  ['Hand swirl', { count: 3000, size: 1.1, render: 'streaks', camHands: 'vortex', camHandReach: 220, camHandForce: 1.2, flow: 0.4, flowType: 'curl', flowScale: 0.003, flowSpeed: 0.15, trail: 0.9, friction: 0.04, jitter: 0.01, palette: 'cosmic', colorBy: 'speed', glow: true, pointerMode: 'vortex', radius: 160, force: 0.6, click: 'ripple' }],
  ['Portrait', { count: 6000, size: 1.2, render: 'dots', shape: 'image', imageMode: 'auto', shapeSize: 0.9, entrance: 'drift', flow: 0.05, flowType: 'curl', trail: 0.3, friction: 0.05, jitter: 0.01, palette: 'mono', colorBy: 'palette', glow: false, pointerMode: 'repel', radius: 90, force: 0.8, click: 'shockwave' }],
  // --- Currents ---
  ['Marbled paper', { count: 3000, size: 1.2, render: 'streaks', flow: 1.2, flowType: 'curl', flowScale: 0.002, flowSpeed: 0.06, trail: 0.97, friction: 0.06, jitter: 0.01, palette: 'paper', colorBy: 'direction', glow: false, pointerMode: 'vortex', radius: 180, force: 0.5, click: 'none' }],
  ['Northern lights', { count: 3500, size: 1.2, render: 'streaks', flow: 0.9, flowType: 'waves', flowScale: 0.0025, flowSpeed: 0.12, wind: 0.1, windDir: 0, trail: 0.94, friction: 0.05, jitter: 0.01, palette: 'aurora', colorBy: 'horizontal', glow: true, pointerMode: 'vortex', radius: 200, force: 0.4, click: 'none' }],
  // --- Weather ---
  ['Rainstorm', { count: 2500, size: 1, render: 'streaks', gravity: 1.5, wind: 0.4, windDir: 0, flow: 0.3, flowType: 'waves', flowScale: 0.003, flowSpeed: 0.8, speed: 1.6, trail: 0.5, friction: 0.03, jitter: 0.02, palette: 'ice', colorBy: 'speed', glow: false, pointerMode: 'repel', radius: 120, force: 0.8, click: 'ripple' }],
  ['Sandstorm', { count: 4000, size: 1.2, render: 'dots', wind: 0.9, windDir: 0, flow: 0.9, flowType: 'curl', flowScale: 0.006, flowSpeed: 0.8, speed: 1.5, trail: 0.8, friction: 0.04, jitter: 0.2, palette: 'desert', colorBy: 'speed', glow: false, pointerMode: 'repel', radius: 140, force: 0.8, click: 'shockwave' }],
  ['Pollen', { count: 500, size: 2, sizeVar: 0.6, render: 'glow', gravity: -0.03, flow: 0.2, flowType: 'curl', flowScale: 0.003, flowSpeed: 0.05, speed: 0.6, trail: 0.4, friction: 0.05, jitter: 0.08, palette: 'gold', colorBy: 'palette', glow: true, pointerMode: 'attract', radius: 260, force: 0.25, click: 'ripple' }],
  // --- Swarms ---
  ['School of fish', { count: 900, size: 2, render: 'arrows', flock: 1, flockAlign: 1.5, flockCohesion: 1.2, flockSep: 1, flockRange: 40, flow: 0.1, flowType: 'curl', flowScale: 0.002, flowSpeed: 0.2, trail: 0.5, friction: 0.01, jitter: 0.04, palette: 'ocean', colorBy: 'direction', glow: false, pointerMode: 'vortex', radius: 220, force: 0.8, click: 'shockwave' }],
  ['Midges', { count: 450, size: 1.6, render: 'glow', flock: 0.8, flockAlign: 0.2, flockCohesion: 2, flockSep: 0.5, flockRange: 100, flow: 0, speed: 1.4, trail: 0.3, friction: 0.02, jitter: 0.5, palette: 'gold', colorBy: 'speed', glow: true, pointerMode: 'attract', radius: 400, force: 0.5, click: 'shockwave' }],
  ['Crowd', { count: 900, size: 2.6, render: 'circles', space: 1, spaceDist: 14, flow: 0.15, flowType: 'curl', flowScale: 0.003, flowSpeed: 0.1, trail: 0, friction: 0.08, jitter: 0.02, palette: 'pastel', colorBy: 'palette', glow: false, pointerMode: 'repel', radius: 140, force: 1.2, click: 'ripple' }],
  // --- Fountains ---
  ['Fireworks', { count: 3000, size: 1.4, render: 'sparkles', emitter: 'point', emitMode: 'burst', burstEvery: 1.2, burstSize: 0.12, emitX: 0.5, emitY: 0.35, emitOut: true, launchSpeed: 4, launchSpread: 360, lifespan: 2.2, lifeFade: 'out', lifeSize: 'shrink', gravity: 0.35, flow: 0, trail: 0.75, friction: 0.03, jitter: 0.02, palette: 'rainbow', colorBy: 'age', glow: true, pointerMode: 'none', click: 'emit' }],
  ['Geyser', { count: 2500, size: 1.4, render: 'glow', emitter: 'point', emitMode: 'steady', emitRate: 0.4, emitX: 0.5, emitY: 0.98, emitOut: false, launchSpeed: 6, launchDir: 270, launchSpread: 12, lifespan: 3.5, lifeFade: 'out', gravity: 0.6, flow: 0, trail: 0.7, friction: 0.01, jitter: 0.03, palette: 'ocean', colorBy: 'age', glow: true, pointerMode: 'repel', radius: 120, force: 0.8, click: 'none' }],
  // --- Forces ---
  ['Black hole', { count: 3000, size: 1.3, render: 'comets', wells: '0.5,0.5,attract;0.5,0.5,vortex', wellForce: 1.6, wellRange: 350, showWells: false, depth: 0.6, flow: 0.1, flowType: 'curl', trail: 0.8, friction: 0.005, jitter: 0.01, palette: 'cosmic', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'shockwave' }],
  ['Slalom', { count: 2500, size: 1.1, render: 'streaks', obstacles: 'circles', obsCircles: '0.2,0.25;0.45,0.25;0.7,0.25;0.32,0.5;0.57,0.5;0.82,0.5;0.2,0.75;0.45,0.75;0.7,0.75', obsRadius: 28, obsForce: 1.2, obsShow: true, wind: 0.6, windDir: 0, flow: 0.2, flowType: 'waves', flowScale: 0.004, flowSpeed: 0.3, edges: 'enter', trail: 0.85, friction: 0.03, jitter: 0.01, palette: 'cyber', colorBy: 'speed', glow: true, pointerMode: 'none', click: 'none' }],
  ['Wind tunnel', { count: 3500, size: 1, render: 'streaks', obstacles: 'text', obsText: 'AERO', obsSize: 0.6, obsForce: 1.4, obsShow: true, wind: 0.7, windDir: 0, flow: 0, trail: 0.93, friction: 0.03, jitter: 0.005, palette: 'blueprint', colorBy: 'speed', glow: false, pointerMode: 'none', click: 'none' }],
  // --- Space ---
  ['Warp speed', { count: 2500, size: 1.4, render: 'streaks', depth: 1, depthParallax: 0, wells: '0.5,0.5,repel', wellForce: 1.5, wellRange: 500, showWells: false, lifespan: 3, lifeFade: 'swell', speed: 2, flow: 0, trail: 0.6, friction: 0.005, jitter: 0.01, palette: 'ice', colorBy: 'depth', glow: true, pointerMode: 'none', click: 'none' }],
  ['Nebula', { count: 220, size: 6, sizeVar: 0.8, render: 'bokeh', depth: 1, depthParallax: 0.6, flow: 0.15, flowType: 'curl', flowScale: 0.002, flowSpeed: 0.05, speed: 0.5, trail: 0, friction: 0.04, jitter: 0.01, palette: 'cosmic', colorBy: 'palette', glow: true, pointerMode: 'repel', radius: 200, force: 0.3, click: 'ripple' }],
  // --- Symbols ---
  ['Runes', { count: 900, size: 2.2, render: 'glyphs', glyphSet: 'runes', glyphPick: 'random', glyphChange: 'flicker', glyphRate: 0.01, glyphFont: 'serif', glyphScale: 1.4, glyphRotate: 'none', flow: 0.4, flowType: 'curl', flowScale: 0.003, flowSpeed: 0.15, trail: 0.5, friction: 0.05, jitter: 0.02, palette: 'ember', colorBy: 'palette', glow: true, pointerMode: 'vortex', radius: 180, force: 0.6, click: 'ripple' }],
  ['Weather map', { count: 1400, size: 2.6, render: 'glyphs', glyphSet: 'arrows', glyphPick: 'heading', glyphChange: 'fixed', glyphFont: 'sans', glyphScale: 1, glyphRotate: 'none', wind: 0.25, windDir: 20, flow: 0.7, flowType: 'curl', flowScale: 0.0025, flowSpeed: 0.08, trail: 0, friction: 0.05, jitter: 0.01, palette: 'paper', colorBy: 'speed', glow: false, pointerMode: 'vortex', radius: 200, force: 0.5, click: 'none' }],
  // --- Shapes (icons, geometry, turning solids, live readouts, sequences, your drawing) ---
  ['Heartbeat', { count: 3200, size: 1.6, render: 'glow', shape: 'icon', shapeIcon: 'heart', shapeSize: 0.75, shapeCycle: 1, entrance: 'centre', entranceTime: 2, flow: 0.15, flowType: 'curl', flowScale: 0.004, flowSpeed: 0.2, trail: 0.6, friction: 0.05, jitter: 0.02, palette: 'crimson', colorBy: 'radial', glow: true, pointerMode: 'repel', radius: 120, force: 0.8, click: 'shockwave' }],
  ['Spirograph', { count: 4500, size: 1, render: 'streaks', shape: 'geo', shapeGeo: 'spiro', shapeSize: 0.9, shapeSpin: 0.15, entrance: 'drift', flow: 0.05, trail: 0.88, friction: 0.05, jitter: 0, palette: 'neon', colorBy: 'cycle', glow: true, pointerMode: 'vortex', radius: 160, force: 0.6, click: 'ripple' }],
  ['DNA', { count: 700, size: 2, render: 'links', linkDist: 46, shape: 'solid', shapeSolid: 'helix', shapeSize: 0.85, shapeSpin: 0.35, entrance: 'formed', flow: 0, trail: 0.3, friction: 0.05, jitter: 0, depth: 0.8, palette: 'toxic', colorBy: 'depth', glow: true, pointerMode: 'repel', radius: 110, force: 0.8, click: 'ripple' }],
  ['Globe', { count: 3500, size: 1.3, render: 'dots', shape: 'solid', shapeSolid: 'sphere', shapeSize: 0.75, shapeSpin: 0.2, entrance: 'centre', entranceTime: 2.5, flow: 0, trail: 0.4, friction: 0.05, jitter: 0, depth: 1, depthParallax: 0.4, palette: 'blueprint', colorBy: 'depth', glow: true, pointerMode: 'repel', radius: 120, force: 0.7, click: 'shockwave' }],
  ['Equalizer', { count: 4000, size: 1.5, render: 'dots', shape: 'live', shapeLive: 'bars', shapeSize: 0.85, entrance: 'formed', flow: 0.05, trail: 0.5, friction: 0.08, jitter: 0.01, palette: 'cyber', colorBy: 'vertical', glow: true, pointerMode: 'repel', radius: 100, force: 0.8, click: 'ripple' }],
  ['Midnight clock', { count: 3500, size: 1.3, render: 'glow', shape: 'live', shapeLive: 'clock', shapeSize: 0.8, entrance: 'drift', flow: 0.25, flowType: 'curl', flowScale: 0.003, flowSpeed: 0.15, trail: 0.75, friction: 0.04, jitter: 0.03, palette: 'ice', colorBy: 'horizontal', glow: true, pointerMode: 'repel', radius: 120, force: 0.8, click: 'shockwave' }],
  ['Oscilloscope', { count: 2500, size: 1.2, render: 'streaks', shape: 'geo', shapeGeo: 'lissajous', shapeSize: 0.85, entrance: 'formed', flow: 0, trail: 0.9, friction: 0.06, jitter: 0, palette: 'toxic', colorBy: 'palette', glow: true, pointerMode: 'attract', radius: 140, force: 0.5, click: 'ripple' }],
  ['Hive', { count: 1400, size: 1.8, render: 'arrows', shape: 'geo', shapeGeo: 'hexagon', shapeSize: 0.8, shapeSpin: 0.05, entrance: 'drift', flock: 0.6, flockAlign: 1, flockCohesion: 0.6, flockSep: 0.8, flockRange: 30, flow: 0.1, trail: 0.55, friction: 0.03, jitter: 0.04, palette: 'gold', colorBy: 'direction', glow: false, pointerMode: 'repel', radius: 140, force: 1, click: 'shockwave' }],
  ['Shapeshift', { count: 4000, size: 1.4, render: 'sparkles', shape: 'sequence', shapeSeq: 'heart, star, moon, flower', shapeSeqEvery: '4bars', shapeSeqSec: 5, shapeSize: 0.75, entrance: 'centre', flow: 0.2, flowType: 'curl', flowScale: 0.004, flowSpeed: 0.2, trail: 0.6, friction: 0.05, jitter: 0.02, palette: 'pastel', colorBy: 'radial', glow: true, pointerMode: 'repel', radius: 120, force: 0.8, click: 'shockwave' }],
  ['Doodle', { count: 4000, size: 1.3, render: 'glow', shape: 'drawing', shapeSize: 0.8, entrance: 'drift', flow: 0.2, flowType: 'curl', flowScale: 0.004, flowSpeed: 0.2, trail: 0.7, friction: 0.05, jitter: 0.02, palette: 'vapor', colorBy: 'cycle', glow: true, pointerMode: 'repel', radius: 120, force: 0.8, click: 'ripple' }],
  ['Atom', { count: 2600, size: 1.4, render: 'glow', shape: 'solid', shapeSolid: 'atom', shapeSize: 0.85, shapeSpin: 0.3, entrance: 'centre', flow: 0, trail: 0.75, friction: 0.05, jitter: 0, depth: 0.8, palette: 'cyber', colorBy: 'depth', glow: true, pointerMode: 'repel', radius: 110, force: 0.8, click: 'shockwave' }],
  ['Saturn', { count: 4000, size: 1.2, render: 'dots', shape: 'solid', shapeSolid: 'saturn', shapeSize: 0.9, shapeSpin: 0.15, entrance: 'drift', flow: 0, trail: 0.5, friction: 0.05, jitter: 0, depth: 1, depthParallax: 0.5, palette: 'desert', colorBy: 'depth', glow: true, pointerMode: 'repel', radius: 120, force: 0.7, click: 'shockwave' }],
  ['Snowflake', { count: 3500, size: 1.3, render: 'sparkles', shape: 'icon', shapeIcon: 'snowflake', shapeSize: 0.85, entrance: 'centre', flow: 0.1, flowType: 'curl', trail: 0.6, friction: 0.05, jitter: 0.01, palette: 'ice', colorBy: 'radial', glow: true, pointerMode: 'repel', radius: 120, force: 0.8, click: 'shockwave' }],
  ['Möbius', { count: 4000, size: 1.1, render: 'dots', shape: 'solid', shapeSolid: 'mobius', shapeSize: 0.9, shapeSpin: 0.25, entrance: 'formed', flow: 0, trail: 0.55, friction: 0.05, jitter: 0, depth: 1, palette: 'vapor', colorBy: 'depth', glow: true, pointerMode: 'repel', radius: 110, force: 0.7, click: 'ripple' }],
  ['Flower of life', { count: 4500, size: 1, render: 'sparkles', shape: 'geo', shapeGeo: 'flowerlife', shapeSize: 0.9, shapeSpin: 0.05, entrance: 'centre', entranceTime: 3, flow: 0, trail: 0.75, friction: 0.05, jitter: 0, palette: 'gold', colorBy: 'radial', glow: true, pointerMode: 'vortex', radius: 160, force: 0.6, click: 'ripple' }],
  ['Crystal', { count: 1800, size: 1.6, render: 'glow', shape: 'solid', shapeSolid: 'icosa', shapeSize: 0.85, shapeSpin: 0.25, entrance: 'formed', flow: 0, trail: 0.8, friction: 0.05, jitter: 0, depth: 0.8, palette: 'cosmic', colorBy: 'depth', glow: true, pointerMode: 'repel', radius: 110, force: 0.8, click: 'shockwave' }],
  // For the "Sacred geometry" timeline set.
  ['Triangle', { count: 3000, size: 1.3, render: 'sparkles', shape: 'geo', shapeGeo: 'triangle', shapeSize: 0.8, shapeSpin: 0.1, entrance: 'centre', flow: 0, trail: 0.7, friction: 0.05, jitter: 0, palette: 'gold', colorBy: 'radial', glow: true, pointerMode: 'vortex', radius: 160, force: 0.6, click: 'ripple' }],
  ['Hexagram', { count: 3500, size: 1.3, render: 'sparkles', shape: 'geo', shapeGeo: 'star6', shapeSize: 0.85, shapeSpin: -0.1, entrance: 'centre', flow: 0, trail: 0.7, friction: 0.05, jitter: 0, palette: 'cosmic', colorBy: 'radial', glow: true, pointerMode: 'vortex', radius: 160, force: 0.6, click: 'ripple' }],
  ['Rose curve', { count: 4000, size: 1.1, render: 'streaks', shape: 'geo', shapeGeo: 'rose', shapeSize: 0.9, shapeSpin: 0.12, entrance: 'drift', flow: 0, trail: 0.85, friction: 0.05, jitter: 0, palette: 'candy', colorBy: 'cycle', glow: true, pointerMode: 'vortex', radius: 160, force: 0.6, click: 'ripple' }],
];

// --- Growth: "seed to tree" ---
// One look that grows, stage by stage, from a handful of particles into
// everything at once. Each stage adds to the last; newcomers bud off the
// particles already there. The timeline set "Seed to tree" plays them in order.
const LENS_OFF: Partial<Settings> = {
  lensMirror: 'off', lensTiles: 0, lensZoom: 0, lensSplit: 0, lensGlitch: 0, lensDots: 0, lensTwirl: 0, lensWave: 0,
  lensRipple: 0, lensFan: 0, lensShatter: 0, lensSlices: 0, lensEcho: 0, lensGlow: 0, lensCrt: 0, audioKaleido: 0,
};
const seed: Partial<Settings> = {
  ...LENS_OFF, budding: true, count: 7, size: 2.6, sizeVar: 0.2, render: 'glow', shape: 'sunflower', shapeSize: 0.04, entrance: 'formed',
  flow: 0.05, flowType: 'curl', flowScale: 0.003, flowSpeed: 0.05, speed: 0.4, trail: 0.75, friction: 0.05, jitter: 0.03,
  palette: 'gold', colorBy: 'palette', glow: false, pointerMode: 'attract', radius: 200, force: 0.3, click: 'ripple',
};
const sprout: Partial<Settings> = { ...seed, count: 40, size: 2, shapeSize: 0.12, jitter: 0.05, palette: 'desert', colorBy: 'radial' };
const bud: Partial<Settings> = { ...sprout, count: 220, size: 1.6, render: 'sparkles', shapeSize: 0.34, flow: 0.15, trail: 0.8, glow: true, palette: 'desert' };
const roots: Partial<Settings> = {
  ...bud, count: 700, size: 1.4, render: 'streaks', shape: 'none', flow: 0.6, flowSpeed: 0.2, speed: 0.9, trail: 0.88,
  jitter: 0.01, palette: 'forest', colorBy: 'direction', pointerMode: 'vortex', force: 0.6,
};
const branches: Partial<Settings> = {
  ...roots, count: 1100, size: 1.6, render: 'ribbons', ribbonLen: 18, trail: 0, flow: 0.8, flowSpeed: 0.25,
  flock: 0.6, flockAlign: 1, flockCohesion: 0.8, flockSep: 0.8, flockRange: 40, palette: 'tealorange',
};
const canopy: Partial<Settings> = {
  ...branches, count: 2600, size: 1.6, render: 'sparkles', ribbonLen: 12, trail: 0.7, flock: 0, depth: 1, depthParallax: 1,
  wells: '0.5,0.5,vortex', wellForce: 0.7, wellRange: 360, showWells: false, palette: 'aurora', colorBy: 'depth', click: 'shockwave',
};
const blossom: Partial<Settings> = {
  ...canopy, count: 4500, size: 1.3, render: 'streaks', flow: 1.1, flowSpeed: 0.35, speed: 1.3, trail: 0.82, depth: 1.4,
  wells: '0.5,0.5,vortex;0.3,0.35,attract;0.7,0.65,attract', wellForce: 1, palette: 'cosmic', colorBy: 'speed',
  lensGlow: 0.45, lensTwirl: 0.25,
};
const extravaganza: Partial<Settings> = {
  ...blossom, count: 7000, size: 1.5, render: 'mixed', mixStyles: 'sparkles,streaks,glow,comets', flow: 1.4, speed: 1.6,
  trail: 0.8, depth: 1.8, depthParallax: 1.4, wellForce: 1.3, palette: 'neon', colorBy: 'cycle',
  audioKaleido: 6, lensGlow: 0.7, lensTwirl: 0.4, lensEcho: 0.3, lensSplit: 0.25,
};
PRESETS.push(
  ['Seed', seed], ['Sprout', sprout], ['Bud', bud], ['Roots', roots],
  ['Branches', branches], ['Canopy', canopy], ['Blossom', blossom], ['Extravaganza', extravaganza],
);
// --- Stories: more timelines that tell one ---
// Each stage starts from the one before and changes a few things, so a
// story reads as one world changing. `chapter` keeps the lenses and the
// stage-specific extras (emitters, wells, obstacles, flocks) from leaking.
const CLEAN: Partial<Settings> = {
  ...LENS_OFF, budding: false, shape: 'none', shapeCycle: 0, emitter: 'none', wells: '', obstacles: 'none', flock: 0, depth: 0,
  gravity: 0, wind: 0, lifespan: 0, edges: 'wrap', entrance: 'drift', pointerMode: 'repel', radius: 140, force: 0.6, click: 'shockwave',
};
function story(...stages: [string, Partial<Settings>][]) {
  let at: Partial<Settings> = { ...CLEAN };
  for (const [name, d] of stages) {
    at = { ...at, ...d };
    PRESETS.push([name, at]);
  }
}
story(
  ['Singularity', { budding: true, count: 5, size: 3, render: 'glow', shape: 'sunflower', shapeSize: 0.01, entrance: 'formed', flow: 0, speed: 0.3, trail: 0.7, friction: 0.05, jitter: 0.05, palette: 'ice', colorBy: 'palette', glow: true }],
  ['Big bang', { count: 6000, size: 1.3, render: 'streaks', shape: 'none', wells: '0.5,0.5,repel', wellForce: 1, wellRange: 500, showWells: false, speed: 2.4, friction: 0.01, flow: 0.2, flowType: 'curl', palette: 'infra', colorBy: 'speed', trail: 0.6, lensGlow: 0.6 }],
  ['Primordial gas', { budding: false, count: 4000, size: 2, render: 'glow', wells: '', flow: 0.6, flowScale: 0.002, flowSpeed: 0.15, speed: 0.6, friction: 0.04, palette: 'vapor', colorBy: 'direction', trail: 0.85, lensGlow: 0.3 }],
  ['First stars', { count: 3000, size: 1.5, render: 'sparkles', flow: 0.2, flock: 0.5, flockCohesion: 1.6, flockSep: 0.5, flockAlign: 0.2, flockRange: 50, palette: 'cosmic', colorBy: 'speed', trail: 0.6 }],
  ['Galaxies', { count: 4500, size: 1.4, flock: 0, wells: '0.3,0.4,vortex;0.72,0.6,vortex', wellForce: 1, wellRange: 260, depth: 1, depthParallax: 0.8, colorBy: 'depth', trail: 0.75 }],
  ['Event horizon', { count: 5000, size: 1.3, render: 'comets', wells: '0.5,0.5,attract;0.5,0.5,vortex', wellForce: 1.8, wellRange: 700, palette: 'infra', colorBy: 'speed', lensTwirl: 0.5, lensGlow: 0.5 }],
);
story(
  ['Dawn', { count: 600, size: 4, sizeVar: 0.6, render: 'bokeh', flow: 0.2, flowType: 'curl', flowScale: 0.002, flowSpeed: 0.08, speed: 0.5, friction: 0.04, jitter: 0.02, palette: 'pastel', colorBy: 'vertical', trail: 0, glow: true, depth: 0.6, depthParallax: 0.5 }],
  ['Morning', { count: 2500, size: 1.6, sizeVar: 0.3, render: 'dots', flow: 0.6, flowType: 'waves', flowScale: 0.004, flowSpeed: 0.25, speed: 0.9, wind: 0.2, windDir: 0, palette: 'ice', colorBy: 'direction', trail: 0.8, depth: 0 }],
  ['Midday', { count: 4500, size: 1.2, render: 'streaks', flow: 1.2, flowType: 'curl', flowSpeed: 0.5, speed: 1.6, wind: 0, palette: 'desert', colorBy: 'speed', trail: 0.85, lensGlow: 0.2 }],
  ['Golden hour', { count: 3000, size: 1.3, flow: 0.8, flowSpeed: 0.25, speed: 1, wind: 0.3, palette: 'sunset', colorBy: 'vertical', trail: 0.92, lensGlow: 0.5 }],
  ['Dusk embers', { count: 1500, size: 1.8, render: 'glow', flow: 0.4, wind: 0, gravity: -0.1, palette: 'ember', colorBy: 'speed', trail: 0.85, lensGlow: 0.3 }],
  ['Firefly night', { count: 300, size: 1.6, render: 'glow', gravity: 0, lifespan: 5, lifeFade: 'swell', flow: 0.3, flowScale: 0.003, flowSpeed: 0.1, speed: 0.6, palette: 'gold', colorBy: 'palette', pointerMode: 'attract', radius: 220, force: 0.3, trail: 0.6, lensGlow: 0.4 }],
  ['Starry night', { count: 1800, size: 1.2, render: 'sparkles', lifespan: 0, depth: 1, depthParallax: 0.6, flow: 0.05, speed: 0.3, wind: 0.05, windDir: 180, palette: 'ice', colorBy: 'depth', trail: 0.3, lensGlow: 0.2 }],
);
story(
  ['Still pond', { count: 2000, size: 1.2, render: 'dots', flow: 0.1, flowType: 'waves', flowScale: 0.003, flowSpeed: 0.1, speed: 0.3, friction: 0.08, jitter: 0.01, palette: 'ocean', colorBy: 'horizontal', trail: 0.9, glow: true, click: 'ripple' }],
  ['Wind rises', { count: 3000, render: 'streaks', wind: 0.6, windDir: 0, flow: 0.6, flowSpeed: 0.4, speed: 1.2, friction: 0.04, palette: 'ice', colorBy: 'speed', trail: 0.85 }],
  ['Rain', { count: 3500, gravity: 1.2, wind: 0.3, flow: 0.2, speed: 1.5, palette: 'ocean', trail: 0.7 }],
  ['Lightning', { palette: 'mono', lensGlitch: 0.5, lensSplit: 0.3, lensGlow: 0.3 }],
  ['Full storm', { count: 6000, speed: 2.2, wind: 0.9, flow: 1.8, flowType: 'curl', flowSpeed: 1, gravity: 0.8, palette: 'ice', lensWave: 0.35, lensGlitch: 0.4, lensSplit: 0.3 }],
  ['Clearing', { count: 1500, size: 1.5, render: 'dots', gravity: 0, wind: 0.1, flow: 0.2, flowType: 'waves', flowSpeed: 0.1, speed: 0.4, palette: 'ice', colorBy: 'vertical', trail: 0.8, lensGlitch: 0, lensSplit: 0, lensWave: 0, lensGlow: 0.3 }],
);
story(
  ['Raindrop', { count: 30, size: 2, render: 'glow', shape: 'sunflower', shapeSize: 0.03, entrance: 'formed', flow: 0, speed: 0.3, trail: 0.7, friction: 0.05, jitter: 0.02, palette: 'ocean', colorBy: 'palette', glow: true }],
  ['Ripples', { count: 1500, size: 1.2, render: 'dots', shape: 'ring', shapeSize: 0.6, shapeCycle: 4, flow: 0.1, flowType: 'waves', colorBy: 'radial', trail: 0.85, click: 'ripple' }],
  ['Streams', { count: 2500, render: 'streaks', shape: 'none', shapeCycle: 0, obstacles: 'circles', obsCircles: '0.3,0.4;0.6,0.62;0.78,0.3', obsRadius: 50, obsForce: 1.2, obsShow: true, wind: 0.4, windDir: 0, edges: 'enter', flow: 0.4, flowSpeed: 0.2, speed: 0.9, colorBy: 'speed', trail: 0.88 }],
  ['River', { count: 4000, wind: 0.8, flow: 0.8, flowScale: 0.003, speed: 1.3, palette: 'ice' }],
  ['Falls', { count: 3000, emitter: 'line', emitMode: 'steady', emitRate: 0.4, emitX: 0.5, emitY: 0.08, emitSize: 700, emitAngle: 0, emitOut: false, launchSpeed: 1, launchDir: 90, launchSpread: 20, lifespan: 5, lifeFade: 'out', gravity: 1, wind: 0, edges: 'wrap', obsCircles: '0.35,0.55;0.62,0.72', obsRadius: 55, flow: 0.15, palette: 'ocean', colorBy: 'age' }],
  ['Open ocean', { count: 6000, emitter: 'none', lifespan: 0, gravity: 0, obstacles: 'none', flow: 1, flowType: 'waves', flowScale: 0.0015, flowSpeed: 0.4, speed: 1, depth: 1, depthParallax: 0.6, colorBy: 'depth', trail: 0.85, lensWave: 0.4, lensGlow: 0.3 }],
);
story(
  ['Star cloud', { count: 4000, size: 1.6, render: 'glow', flow: 0.5, flowType: 'curl', flowScale: 0.002, flowSpeed: 0.15, speed: 0.6, friction: 0.04, palette: 'lavender', colorBy: 'direction', trail: 0.8, glow: true }],
  ['Collapse', { wells: '0.5,0.5,attract', wellForce: 1.4, wellRange: 800, showWells: false, palette: 'ember', colorBy: 'speed' }],
  ['Young star', { count: 2500, size: 1.2, render: 'dots', wells: '', shape: 'sunflower', shapeSize: 0.25, entrance: 'formed', palette: 'gold', colorBy: 'radial', jitter: 0.08, lensGlow: 0.35 }],
  ['Red giant', { count: 3000, shapeSize: 0.7, size: 1.6, palette: 'crimson', jitter: 0.12, lensGlow: 0.4 }],
  ['Supernova', { count: 7000, shape: 'none', wells: '0.5,0.5,repel', wellForce: 2, wellRange: 900, speed: 2.5, friction: 0.015, render: 'streaks', size: 1.3, palette: 'rainbow', colorBy: 'speed', lensSplit: 0.3 }],
  ['Remnant', { count: 260, size: 5.5, sizeVar: 0.7, render: 'bokeh', wells: '', flow: 0.2, speed: 0.5, friction: 0.04, depth: 1, depthParallax: 0.6, palette: 'vapor', colorBy: 'depth', lensSplit: 0, lensGlow: 0.15 }],
);
story(
  ['A few birds', { count: 25, size: 2.6, render: 'arrows', flock: 1, flockAlign: 1.2, flockCohesion: 1, flockSep: 0.8, flockRange: 60, flow: 0.15, flowType: 'curl', flowScale: 0.002, flowSpeed: 0.2, speed: 1, friction: 0.01, jitter: 0.06, palette: 'ice', colorBy: 'direction', trail: 0.5, glow: false }],
  ['Flock', { count: 400, size: 2.2 }],
  ['Murmuration', { count: 1500, size: 1.6, flockRange: 45, trail: 0.6, palette: 'sunset' }],
  ['The split', { obstacles: 'circles', obsCircles: '0.5,0.5', obsRadius: 140, obsForce: 1.4, obsShow: false }],
  ['Sky shapes', { obstacles: 'none', shape: 'ring', shapeSize: 0.7, entrance: 'drift', flock: 0.5 }],
  ['Scatter', { shape: 'none', flock: 0.3, speed: 2, render: 'streaks', trail: 0.75 }],
);


// Preset families: each built around one engine feature (see the proposal doc).
export type Family = 'all' | 'shapes' | 'growth' | 'stories' | 'camera' | 'words' | 'patterns' | 'currents' | 'weather' | 'swarms' | 'fountains' | 'forces' | 'space' | 'symbols';
export const FAMILIES: [Family, string][] = [
  ['all', 'All'], ['camera', 'Camera'], ['words', 'Words'], ['patterns', 'Patterns'], ['currents', 'Currents'], ['weather', 'Weather'],
  ['swarms', 'Swarms'], ['fountains', 'Fountains'], ['forces', 'Forces'], ['space', 'Space'], ['symbols', 'Symbols'], ['shapes', 'Shapes'], ['growth', 'Growth'], ['stories', 'Stories'],
];
export const FAMILY_OF: Record<string, Family> = {};
for (const [fam, names] of [
  ['words', 'Hello, Marquee, Neon sign, Typewriter, Smoke writing, Shatter, Glyph word, Dot matrix, Breathing word'],
  ['patterns', 'Sunflower, Lattice, Halo, Mandala, Pond, Portrait'],
  ['camera', 'Face mesh, Glow face, Live sketch, Two faces, Silhouette, Portrait colours, Deep face, Breath, Hand play, Hand swirl, Light painting, Smoke drawing, Neon graffiti, Finger sparks, Hand magnets, Force field, Gesture DJ, Stretch, Hand skeleton, Throw, Finger paint, Flame head, Crying rainbow, Laser eyes, Wizard beard, Angel halo, Crown, Singer, Eye contact, Dancer, Arm sweep, Rain on me, Twins'],
  ['currents', 'Drift, Silk, Dusk, Ink, Prism, Neon storm, Silk ribbons, Heat, Marbled paper, Northern lights'],
  ['weather', 'Snowfall, Embers, Fireflies, Bubbles, Rainstorm, Sandstorm, Pollen'],
  ['swarms', 'Starlings, Marbles, School of fish, Midges, Crowd'],
  ['fountains', 'Campfire, Pulse rings, Waterfall, Sparkler, Confetti, Fireworks, Geyser'],
  ['forces', 'Riverstones, Windbreak, Orbit, Black hole, Slalom, Wind tunnel'],
  ['space', 'Deep space, Galaxy, Comet shower, Bokeh, Constellation, Warp speed, Nebula'],
  ['symbols', 'ASCII, Compass, Digital rain, Runes, Weather map'],
  ['shapes', 'Heartbeat, Spirograph, DNA, Globe, Equalizer, Midnight clock, Oscilloscope, Hive, Shapeshift, Doodle, Triangle, Hexagram, Rose curve, Atom, Saturn, Snowflake, Möbius, Flower of life, Crystal'],
  ['growth', 'Seed, Sprout, Bud, Roots, Branches, Canopy, Blossom, Extravaganza'],
  ['stories', 'Singularity, Big bang, Primordial gas, First stars, Galaxies, Event horizon, Dawn, Morning, Midday, Golden hour, Dusk embers, Firefly night, Starry night, Still pond, Wind rises, Rain, Lightning, Full storm, Clearing, Raindrop, Ripples, Streams, River, Falls, Open ocean, Star cloud, Collapse, Young star, Red giant, Supernova, Remnant, A few birds, Flock, Murmuration, The split, Sky shapes, Scatter'],
] as [Family, string][]) for (const n of names.split(', ')) FAMILY_OF[n] = fam;

// Vibes: how the music moves the particles. They only set the reaction
// (what each drum does and how strongly), never the detection, so any
// vibe works with any genre.
export type Vibe = Partial<Settings>;
export const quiet: Vibe = {
  audioKick: 'none', audioPulse: 0.6, audioBeat: 'ripple', audioWaveAt: 'centre', audioWaveEvery: 1,
  audioWaveForce: 1, audioWaveSpeed: 1, audioWaveReach: 1, audioWaveWidth: 1, audioWaveAccent: true, audioWaveFeel: 'soft', audioWaveRings: false,
  audioSnare: 'none', audioHats: 'none', audioHits: 0.5, audioSub: 'none', audioSubAmt: 0.5, audioSpeed: 0.3, audioFlow: 0.4,
};
// A vibe is a full recipe for how the music plays the field: the drums
// (what each hit does), the music cards (drops, groups, colour, camera)
// and, optionally, the look. Locked cards keep their own settings.
export type VibeFamily = 'all' | 'chill' | 'groove' | 'hypnotic' | 'peak' | 'glitch' | 'words' | 'face';
export const VIBE_FAMILIES: [VibeFamily, string][] = [['all', 'All'], ['chill', 'Chill'], ['groove', 'Groove'], ['hypnotic', 'Hypnotic'], ['peak', 'Peak'], ['glitch', 'Glitch'], ['words', 'Words'], ['face', 'Face']];
// `suits`: the preset family this vibe looks best with. With "Vibes also
// change the look" on, picking it switches to a preset from that family.
// What a vibe mainly listens to. One layer leads, at most one supports,
// so vibes feel different instead of all jumping on the kick.
export type VibeLead = 'beat' | 'bass' | 'melody' | 'voice' | 'song';
export const VIBE_LEADS: [VibeLead | 'any', string][] = [['any', 'Any'], ['beat', 'Beat'], ['bass', 'Bass'], ['melody', 'Melody'], ['voice', 'Voice'], ['song', 'Song shape']];
export const LEAD_ABOUT: Record<VibeLead, string> = { beat: 'the drums', bass: 'the bass and energy', melody: 'the melody', voice: 'the voice', song: 'build-ups and drops' };
export type VibeDef = { name: string; about: string; lead: VibeLead; family: VibeFamily; suits?: Family; drums: Vibe; cards: Partial<Settings>; look: Partial<Settings> };
export const CARDS_OFF: Partial<Settings> = {
  audioDrop: 0, audioDropBuild: true, audioBands: 0, audioHue: 'off', audioHueAmt: 30, audioBright: 0, audioCam: 0, audioSpin: 'off',
  audioCuts: 'off', audioDolly: false, audioPan: 0, audioRoll: 0, audioFlip: false,
  audioTunnel: 0, audioTunnelTurn: 'none', audioKaleido: 0, audioKaleidoDrop: false, audioEcho: 0,
  audioPalEvery: 0, audioMonoBuild: false, audioBgFlash: 0, audioInvert: false,
  audioStutter: false, audioGravFlip: false, audioTrailEnergy: 0, audioSway: 0,
  audioWordsOn: false, audioWordsEvery: 'bar', audioWordPulse: 0, audioLetterHop: 0,
  audioSnareFlash: 0, audioSnareHop: 0, audioHatTwinkle: 0, audioHatShake: 0, audioBassThrob: 0, audioBassZoom: 0, audioBassGlow: 0, audioBuildScatter: 0, audioEnergyShake: 0, audioEnergyWords: 0,
  audioNoteRipple: 0, audioNoteHue: 0, audioNoteHop: 0, audioVoxGlow: 0, audioVoxZoom: 0, audioVoxSwell: 0,
  audioSylPush: 0, audioSylFlash: 0, audioSylHop: 0, audioPauseDim: 0, audioPauseFreeze: 0, audioFlowSpeed: 0, audioFlowHue: 0, audioAccentBurst: 0, audioAccentPunch: 0, audioPitchLift: 0, audioPitchTilt: 0, audioRhymeRipple: 0, audioRhymeHue: 0,
};
export const vibe = (name: string, about: string, lead: VibeLead, drums: Vibe, cards: Partial<Settings>, look: Partial<Settings>, family: VibeFamily = 'all', suits?: Family): VibeDef => ({
  name, about, lead, family, suits, drums: { ...quiet, ...drums }, cards: { ...CARDS_OFF, ...cards }, look,
});
export const VIBES: VibeDef[] = [
  // --- Chill ---
  vibe('Breathe', 'The field ducks on each kick and swells back', 'bass', { audioKick: 'pump', audioPulse: 0.7, audioSub: 'size', audioSubAmt: 0.5, audioSpeed: 0.15, audioFlow: 0.3 },
    { audioDrop: 0.6, audioHue: 'drift', audioHueAmt: 20, audioBright: 0.4, audioBassZoom: 0.4, audioSpin: 'sway' }, { render: 'glow', trail: 0.85, flow: 0.3, flowType: 'curl' }, 'chill'),
  vibe('Ambient', 'No hits: colour follows the melody, gentle sway', 'melody', { audioSub: 'size', audioSubAmt: 0.6, audioSpeed: 0.1, audioFlow: 0.6 },
    { audioNoteHue: 0.6, audioNoteRipple: 0.25, audioBright: 0.3, audioSpin: 'sway' }, { render: 'bokeh', trail: 0.6, flow: 0.3, flowType: 'curl' }, 'chill'),
  vibe('Minimal', 'Each kick turns the flow one small step', 'beat', { audioKick: 'tick', audioPulse: 0.6, audioSpeed: 0.1, audioFlow: 0.1 }, {}, { render: 'dots', trail: 0.3, flow: 0.4, flowType: 'curl' }, 'chill'),
  vibe('Lo-fi', 'Laid back: a soft duck on the kick, slow sway', 'bass', { audioKick: 'pump', audioPulse: 0.4, audioSub: 'flow', audioSubAmt: 0.5, audioSpeed: 0.1, audioFlow: 0.3 },
    { audioDrop: 0.4, audioHue: 'drift', audioHueAmt: 8, audioBright: 0.2, audioSway: 0.4 }, { render: 'streaks', trail: 0.92, flow: 0.5, flowType: 'curl' }, 'chill'),
  vibe('Underwater', 'Bass sways the field, a faint tunnel, drifting blues', 'bass', { audioSub: 'flow', audioSubAmt: 0.8, audioSpeed: 0.1, audioFlow: 0.6 },
    { audioHue: 'drift', audioHueAmt: 10, audioBright: 0.3, audioSway: 0.6, audioBassZoom: 0.3, audioPan: 0.5, audioTunnel: 0.2 }, { render: 'bokeh', trail: 0.8, flow: 0.4, flowType: 'curl', palette: 'ocean' }, 'chill', 'currents'),
  vibe('Night drive', 'Long trails, hi-hats twinkle, a slow pan and dolly', 'melody', { audioSpeed: 0.2 },
    { audioDrop: 0.5, audioNoteHue: 0.35, audioHatTwinkle: 0.5, audioBright: 0.3, audioPan: 0.6, audioDolly: true, audioTrailEnergy: 0.5 }, { render: 'streaks', trail: 0.9, flow: 0.4, flowType: 'curl', palette: 'cyber' }, 'chill', 'space'),
  vibe('Shimmer', 'Hi-hats twinkle and shiver; nothing jumps', 'beat', { audioSpeed: 0.15, audioFlow: 0.4 },
    { audioHatTwinkle: 0.8, audioHatShake: 0.3, audioHue: 'drift', audioHueAmt: 12, audioBright: 0.3 }, { render: 'sparkles', trail: 0.7, flow: 0.4, flowType: 'curl' }, 'chill', 'space'),
  vibe('Ballad', 'Glows and lifts with the singer’s voice', 'voice', { audioSpeed: 0.1, audioFlow: 0.3 },
    { audioVoxGlow: 0.6, audioVoxZoom: 0.4, audioVoxSwell: 0.5, audioPitchLift: 0.6, audioNoteHue: 0.3, audioDrop: 0.5 }, { render: 'glow', trail: 0.85, flow: 0.3, flowType: 'curl' }, 'chill'),
  // --- Groove ---
  vibe('Groove', 'Snare swirls, the bass throbs, colour steps each bar', 'bass', { audioSnare: 'swirl', audioHits: 0.5, audioSub: 'flow', audioSubAmt: 0.6, audioSpeed: 0.3, audioFlow: 0.5 },
    { audioDrop: 1, audioBassThrob: 0.6, audioHue: 'bar', audioHueAmt: 40, audioBright: 0.3, audioBands: 0.5 }, { render: 'circles', trail: 0.55, flow: 0.5, flowType: 'waves' }, 'groove'),
  vibe('Bounce', 'Everything jumps: waves, ripples, sparks', 'beat', { audioKick: 'both', audioPulse: 0.9, audioBeat: 'ripple', audioSnare: 'wave', audioHats: 'sparkle', audioHits: 0.6, audioSub: 'size', audioSubAmt: 0.7, audioSpeed: 0.4 },
    { audioDrop: 1, audioHue: 'beat', audioHueAmt: 12, audioBright: 0.5, audioCam: 0.8, audioBands: 1 }, { render: 'circles', trail: 0.15, flow: 0.2, flowType: 'waves' }, 'groove'),
  vibe('Disco', 'Flashing floor, colour every kick, stepping spin', 'beat', { audioKick: 'both', audioPulse: 0.8, audioBeat: 'ripple', audioSnare: 'flash', audioHats: 'sparkle', audioHits: 0.7, audioSpeed: 0.3 },
    { audioDrop: 1, audioHue: 'beat', audioHueAmt: 40, audioBgFlash: 0.5, audioCam: 0.4, audioSpin: 'step', audioBands: 0.5 }, { render: 'sparkles', trail: 0.4, palette: 'rainbow' }, 'groove', 'patterns'),
  vibe('House', 'Four to the floor pumping, hats twinkle, cuts every 4 bars', 'beat', { audioKick: 'pump', audioPulse: 1, audioSub: 'size', audioSubAmt: 0.5, audioSpeed: 0.3 },
    { audioDrop: 1, audioHatTwinkle: 0.5, audioHue: 'bar', audioHueAmt: 30, audioBright: 0.4, audioCuts: '4bars', audioSway: 0.4, audioPalEvery: 16 }, { render: 'circles', trail: 0.5, flow: 0.4, flowType: 'waves' }, 'groove', 'swarms'),
  vibe('Funk', 'A loose bass throb and sway, rolls on the snare', 'bass', { audioSub: 'flow', audioSubAmt: 0.7, audioSpeed: 0.3 },
    { audioDrop: 0.8, audioBassThrob: 0.8, audioSway: 0.8, audioRoll: 0.6, audioHue: 'bar', audioHueAmt: 50 }, { render: 'glow', trail: 0.6, flow: 0.5, flowType: 'curl', palette: 'sunset' }, 'groove', 'currents'),
  vibe('Cypher', 'Rap flow: pushes on syllables, ripples on rhymes', 'voice', { audioSpeed: 0.2, audioFlow: 0.3 },
    { audioSylPush: 0.6, audioAccentPunch: 0.5, audioRhymeRipple: 0.6, audioRhymeHue: 0.5, audioPauseDim: 0.4, audioFlowSpeed: 0.4, audioDrop: 0.6 }, { render: 'dots', trail: 0.5, flow: 0.3, flowType: 'curl' }, 'groove'),
  // --- Hypnotic ---
  vibe('Hypnotic', 'The flow turns a step each kick, colour follows the melody', 'melody', { audioKick: 'tick', audioPulse: 0.5, audioSub: 'flow', audioSubAmt: 0.8, audioSpeed: 0.1, audioFlow: 0.8 },
    { audioDrop: 0.6, audioNoteHue: 0.6, audioBright: 0.3, audioSpin: 'turn' }, { render: 'streaks', trail: 0.9, flow: 0.8, flowType: 'curl' }, 'hypnotic'),
  vibe('Liquid', 'Long rolling waves every 4 kicks, the bass stirs the smoke', 'bass', { audioKick: 'wave', audioBeat: 'ripple', audioWaveEvery: 4, audioWaveReach: 2.2, audioWaveWidth: 2, audioWaveSpeed: 0.6, audioWaveForce: 0.7, audioSub: 'flow', audioSubAmt: 1.2, audioSpeed: 0.2, audioFlow: 1 },
    { audioDrop: 0.8, audioBassThrob: 0.5, audioHue: 'drift', audioHueAmt: 15, audioBright: 0.5, audioSpin: 'sway' }, { render: 'glow', trail: 0.93, flow: 1, flowType: 'curl' }, 'hypnotic'),
  vibe('Kaleido', 'Mirrored star bursts, colour from the melody', 'melody', { audioKick: 'wave', audioBeat: 'star', audioWaveAt: 'mirror', audioWaveEvery: 2, audioWaveReach: 1.3, audioSpeed: 0.2 },
    { audioDrop: 1, audioNoteHue: 0.7, audioNoteRipple: 0.4, audioBright: 0.4, audioSpin: 'turn', audioBands: 0.5 }, { render: 'sparkles', trail: 0.7, flow: 0.4, flowType: 'curl' }, 'hypnotic'),
  vibe('Tunnel', 'Everything streams out of the centre, breathing with the bass', 'bass', { audioSub: 'size', audioSubAmt: 0.5, audioSpeed: 0.2 },
    { audioDrop: 0.8, audioTunnel: 0.7, audioTunnelTurn: 'rock', audioBassZoom: 0.5, audioBassGlow: 0.4, audioHue: 'drift', audioHueAmt: 20 }, { render: 'glow', size: 1.4, sizeVar: 0.3, trail: 0.6, flow: 0.5, flowType: 'curl' }, 'hypnotic', 'space'),
  vibe('Spiral', 'A turning tunnel through a kaleidoscope, ticking with the kick', 'beat', { audioKick: 'tick', audioPulse: 0.7, audioSub: 'flow', audioSubAmt: 0.6, audioSpeed: 0.2 },
    { audioDrop: 0.6, audioTunnel: 0.5, audioTunnelTurn: 'right', audioSpin: 'turn', audioKaleido: 6, audioNoteHue: 0.4 }, { render: 'streaks', trail: 0.7, flow: 0.6, flowType: 'curl' }, 'hypnotic', 'patterns'),
  vibe('Trance', 'Colour drains and the shape shivers in the build, explodes at the drop', 'song', { audioKick: 'pump', audioPulse: 0.5, audioSub: 'flow', audioSubAmt: 0.8, audioSpeed: 0.3 },
    { audioDrop: 1.6, audioDolly: true, audioMonoBuild: true, audioBuildScatter: 0.5, audioHue: 'drop', audioHueAmt: 90, audioBright: 0.6, audioEcho: 0.4 }, { render: 'glow', trail: 0.85, flow: 0.7, flowType: 'curl' }, 'hypnotic', 'currents'),
  // --- Peak ---
  vibe('Storm', 'Shockwaves, shaking camera, big drops', 'beat', { audioWaveFeel: 'punchy', audioKick: 'both', audioPulse: 1.2, audioBeat: 'shockwave', audioWaveAt: 'random', audioSnare: 'flash', audioHats: 'sparkle', audioHits: 0.9, audioSub: 'speed', audioSubAmt: 0.8, audioSpeed: 0.9, audioFlow: 1.2 },
    { audioDrop: 1.6, audioHue: 'drop', audioHueAmt: 60, audioBright: 0.7, audioCam: 1.2, audioBands: 0.8 }, { render: 'streaks', trail: 0.7, flow: 1.4, flowType: 'waves' }, 'peak'),
  vibe('Rave', 'Colour every kick, strobing, big camera', 'beat', { audioWaveFeel: 'punchy', audioKick: 'both', audioPulse: 1, audioBeat: 'mix', audioWaveAt: 'random', audioSnare: 'flash', audioHats: 'sparkle', audioHits: 0.9, audioSpeed: 0.6 },
    { audioDrop: 1.4, audioHue: 'beat', audioHueAmt: 45, audioBright: 1, audioCam: 1.2, audioBands: 0.7 }, { render: 'glow', trail: 0.5, flow: 0.6, flowType: 'waves' }, 'peak'),
  vibe('Bass face', 'Heavy: the bass throbs, glows and zooms, huge drops', 'bass', { audioSub: 'size', audioSubAmt: 1.2, audioSpeed: 0.4 },
    { audioDrop: 1.8, audioBassThrob: 1.2, audioBassZoom: 0.8, audioBassGlow: 0.6, audioHue: 'drop', audioHueAmt: 90, audioCam: 0.5 }, { render: 'circles', trail: 0.4, flow: 0.4, flowType: 'waves' }, 'peak'),
  vibe('Festival', 'Long build-ups, a kaleidoscope burst at each drop, sparks on kicks', 'song', { audioKick: 'spawn', audioPulse: 0.8, audioHats: 'sparkle', audioHits: 0.5, audioSpeed: 0.5 },
    { audioDrop: 2, audioBuildScatter: 0.6, audioKaleidoDrop: true, audioHue: 'drop', audioHueAmt: 120, audioBright: 0.8, audioDolly: true }, { render: 'sparkles', trail: 0.75, flow: 0.7, flowType: 'curl' }, 'peak'),
  vibe('Techno', 'Machine ticks, hard sweeps on snares, freeze frames', 'beat', { audioKick: 'tick', audioPulse: 1, audioSnare: 'swirl', audioHats: 'sparkle', audioHits: 0.6, audioSpeed: 0.5 },
    { audioDrop: 1.4, audioCuts: '2bars', audioHatShake: 0.4, audioStutter: true, audioBright: 0.6 }, { render: 'dots', trail: 0.3, flow: 0.5, flowType: 'waves', palette: 'mono' }, 'peak', 'forces'),
  vibe('Drum & bass', 'Sparks burst on kicks, fast cuts, rolling camera', 'beat', { audioKick: 'spawn', audioPulse: 1.2, audioSnare: 'flash', audioHits: 0.9, audioSub: 'speed', audioSubAmt: 1, audioSpeed: 0.8 },
    { audioDrop: 1.6, audioRoll: 0.8, audioCuts: 'bar', audioTrailEnergy: 0.5, audioEnergyShake: 0.3, audioBright: 0.5 }, { render: 'streaks', trail: 0.6, flow: 0.8, flowType: 'waves' }, 'peak', 'fountains'),
  vibe('Dubstep', 'Wobble sway, gravity flips, inverted drops', 'song', { audioSub: 'size', audioSubAmt: 1.4, audioSpeed: 0.5 },
    { audioDrop: 2, audioSway: 1, audioBassThrob: 0.8, audioGravFlip: true, audioInvert: true, audioMonoBuild: true, audioCam: 0.8, audioHue: 'drop', audioHueAmt: 120, audioBright: 0.7 }, { render: 'circles', trail: 0.4, flow: 0.4 }, 'peak', 'forces'),
  // --- Glitch ---
  vibe('Glitch', 'Hard sweeps, flashes, colour jumps', 'beat', { audioWaveFeel: 'punchy', audioKick: 'wave', audioBeat: 'sweep', audioWaveForce: 1.4, audioWaveSpeed: 1.6, audioSnare: 'flash', audioHats: 'sparkle', audioHits: 1.1, audioSpeed: 0.5, audioFlow: 0.2 },
    { audioDrop: 1.2, audioHue: 'beat', audioHueAmt: 90, audioBright: 0.8, audioCam: 1, audioBands: 1 }, { render: 'dots', trail: 0, flow: 0.2, flowType: 'waves', glow: false }, 'glitch'),
  vibe('Datamosh', 'Smeared echoes, cuts and freezes', 'beat', { audioWaveFeel: 'punchy', audioKick: 'wave', audioBeat: 'sweep', audioSnare: 'flash', audioHits: 1, audioSpeed: 0.4 },
    { audioDrop: 1, audioEcho: 0.9, audioTunnel: 0.3, audioCuts: 'bar', audioStutter: true, audioHue: 'beat', audioHueAmt: 60, audioCam: 0.8 }, { render: 'dots', trail: 0.5, glow: false }, 'glitch', 'symbols'),
  vibe('Broken TV', 'Snares flash and roll, hats shake, inverted drops', 'beat', { audioSnare: 'flash', audioHits: 1, audioSpeed: 0.6 },
    { audioDrop: 1, audioSnareFlash: 0.6, audioHatShake: 0.5, audioStutter: true, audioRoll: 1, audioFlip: true, audioInvert: true, audioBright: 0.8 }, { render: 'dots', trail: 0.2, palette: 'mono' }, 'glitch', 'symbols'),
  vibe('Strobe', 'White flashes and hard colour jumps', 'beat', { audioKick: 'pulse', audioPulse: 1, audioSnare: 'flash', audioHats: 'sparkle', audioHits: 1.2, audioSpeed: 0.5 },
    { audioDrop: 1.2, audioBgFlash: 1, audioInvert: true, audioCuts: 'bar', audioCam: 1, audioHue: 'beat', audioHueAmt: 180, audioBright: 1 }, { render: 'dots', trail: 0, glow: false }, 'glitch', 'space'),
  // --- Words ---
  vibe('Chant', 'A new word every bar, swelling with the vocals', 'voice', { audioSpeed: 0.2 },
    { audioDrop: 0.8, audioWordsOn: true, audioWords: 'LOVE, PEACE, UNITY, RESPECT', audioWordsEvery: 'bar', audioVoxSwell: 0.6, audioVoxGlow: 0.4, audioHue: 'bar', audioHueAmt: 40 }, {}, 'words', 'words'),
  vibe('Shout', 'Big words punching with the kick', 'beat', { audioKick: 'pulse', audioPulse: 1, audioSnare: 'flash', audioHits: 0.8, audioSpeed: 0.3 },
    { audioDrop: 1.4, audioWordsOn: true, audioWords: 'YES, LOUD, NOW, JUMP', audioWordsEvery: '2bars', audioWordPulse: 1, audioCam: 0.8, audioBgFlash: 0.3 }, {}, 'words', 'words'),
  vibe('Echo word', 'Letters hop with the syllables, echoes trail behind', 'voice', { audioSpeed: 0.2 },
    { audioDrop: 0.8, audioWordsOn: true, audioWords: 'HERE, NOW, ALWAYS', audioWordsEvery: '4bars', audioEcho: 0.8, audioSylHop: 0.6, audioNoteHop: 0.4, audioHue: 'drift', audioHueAmt: 20 }, {}, 'words', 'words'),
  vibe('Grow', 'The word grows with the energy and shivers in build-ups', 'song', { audioSpeed: 0.2 },
    { audioDrop: 1.2, audioWordsOn: true, audioWords: 'RISE, HIGHER, NOW', audioWordsEvery: 'drop', audioEnergyWords: 0.7, audioBuildScatter: 0.6, audioMonoBuild: true, audioHue: 'drop', audioHueAmt: 90 }, {}, 'words', 'words'),
  // --- Face (with the camera) ---
  vibe('Mask', 'Your face glows and leans in with the vocals', 'voice', { audioSpeed: 0.2 },
    { audioDrop: 1, audioVoxGlow: 0.6, audioVoxZoom: 0.4, audioVoxSwell: 0.4, audioHue: 'bar', audioHueAmt: 40, audioEcho: 0.3 }, {}, 'face', 'camera'),
  vibe('Face dance', 'Your face pumps, sways and cuts with the beat', 'beat', { audioKick: 'pump', audioPulse: 0.8, audioSpeed: 0.3 },
    { audioDrop: 1.2, audioWordPulse: 0.5, audioSway: 0.6, audioRoll: 0.5, audioCuts: '4bars', audioHue: 'beat', audioHueAmt: 30 }, {}, 'face', 'camera'),
  vibe('Hologram', 'Flickers on each syllable, fades in the gaps', 'voice', { audioSpeed: 0.3 },
    { audioDrop: 1, audioSylFlash: 0.7, audioPauseDim: 0.5, audioTunnel: 0.3, audioStutter: true, audioMonoBuild: true }, { render: 'dots', palette: 'ice' }, 'face', 'camera'),
];
