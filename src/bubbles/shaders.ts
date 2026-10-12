// The GLSL. Every layer draws straight to clip space (no ScreenTransform), in
// linear colour, ending with three's colorspace chunk.

/** The dreamy sky: a pastel gradient, a soft glow, drifting clouds, twinkles. */
const SKY = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uBottom;
  uniform vec3 uCloud;
  uniform float uAspect;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }
  vec3 sky(vec2 uv, float t) {
    vec3 col = mix(uBottom, uMid, smoothstep(0.0, 0.55, uv.y));
    col = mix(col, uTop, smoothstep(0.45, 1.0, uv.y));
    vec2 p = uv * vec2(uAspect, 1.0);
    // A soft glow, high on the right.
    vec2 g = (uv - vec2(0.75, 0.8)) * vec2(uAspect, 1.0);
    col += vec3(1.0, 0.9, 0.8) * 0.35 * exp(-dot(g, g) * 8.0);
    // Two cloud layers drifting at different speeds.
    float c1 = fbm(p * 2.1 + vec2(t * 0.012, 0.0));
    float c2 = fbm(p * 4.2 + vec2(-t * 0.02, t * 0.004) + 7.0);
    float c = smoothstep(0.5, 0.8, c1 * 0.78 + c2 * 0.34);
    col = mix(col, uCloud, c * 0.8);
    // Twinkles.
    vec2 sp = p * 26.0;
    vec2 ci = floor(sp);
    vec2 cf = fract(sp) - 0.5;
    float h = hash(ci);
    float tw = 0.5 + 0.5 * sin(t * 2.0 + h * 40.0);
    col += step(0.94, h) * smoothstep(0.13, 0.0, length(cf)) * tw * 0.7;
    return col;
  }
`;

export const fullVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }
`;

export const skyFrag = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  ${SKY}
  void main() {
    gl_FragColor = vec4(sky(vUv, uTime), 1.0);
    #include <colorspace_fragment>
  }
`;

/** Bubble quads: local coords ±EXTENT around the centre, 1 = the bubble's radius. */
export const BUBBLE_EXTENT = 1.7;

export const bubbleVert = /* glsl */ `
  uniform vec2 uCenter;
  uniform vec2 uHalf;
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy * 2.0 * ${BUBBLE_EXTENT.toFixed(2)};
    gl_Position = vec4(uCenter + vLocal * uHalf, 0.0, 1.0);
  }
`;

/**
 * A soap bubble with you inside: the sky seen through it (bulged), you cut out
 * by the person mask over that, a swirling rainbow film toward the rim, a
 * bright rim and two highlights. It wobbles, squashes when bumped, and on a pop
 * flashes and leaves a fading ring.
 */
export const bubbleFrag = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uPop;
  uniform float uSquash;
  uniform vec2 uSquashDir;
  uniform vec2 uScreen;
  uniform vec2 uScreenHalf;
  uniform sampler2D uCamera;
  uniform sampler2D uMask;
  uniform float uCameraLinear;
  uniform float uHasMask;
  uniform vec2 uCrop;
  uniform vec2 uCropHalf;
  uniform vec2 uEdge;
  uniform vec2 uErode;
  varying vec2 vLocal;
  ${SKY}
  vec3 fromSrgb(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  vec3 film(float x) {
    return 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + x));
  }
  void main() {
    vec2 p = vLocal;
    float len = length(p);
    float ang = atan(p.y, p.x);
    // Wobble: a slow ripple round the rim, plus a squash along the bump.
    vec2 dir = p / max(len, 1e-4);
    float wob = 1.0
      + 0.022 * sin(ang * 3.0 + uTime * 2.1 + uPhase)
      + 0.016 * sin(ang * 2.0 - uTime * 1.5 + uPhase * 2.0)
      - 0.16 * uSquash * abs(dot(dir, uSquashDir))
      + 0.06 * uSquash;
    float d = len / wob;

    if (uPop > 0.0) {
      // Burst: a flash inside, then a thin rainbow ring spreading and fading.
      float k = clamp(uPop, 0.0, 1.0);
      float ringR = 1.0 + 0.55 * k;
      float ring = smoothstep(0.07, 0.0, abs(len - ringR)) * (1.0 - k);
      float flash = (1.0 - smoothstep(0.0, 0.35, k)) * (1.0 - smoothstep(0.9, 1.0, d));
      vec3 col = film(ang * 0.3 + uTime * 0.4) * 0.6 + 0.6;
      float a = max(ring, flash * 0.85);
      if (a <= 0.003) discard;
      gl_FragColor = vec4(mix(col, vec3(1.0), flash), a);
      #include <colorspace_fragment>
      return;
    }

    float aa = fwidth(d) * 1.5;
    float alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
    if (alpha <= 0.0) discard;
    vec2 q = p / wob;
    // A sphere bulges what's behind it: the middle magnified, the edge squeezed.
    float z = sqrt(max(0.0, 1.0 - dot(q, q)));
    vec2 lens = q * (0.72 + 0.28 * z);

    // The sky through the bubble, a little brighter.
    vec3 col = sky(uScreen + lens * uScreenHalf * 0.85, uTime) * 1.04 + 0.03;

    // You, cut out by the person mask. The mask comes up from a small model
    // in steps; a disc blur rounds them off, and thresholding the blur above
    // half erodes the edge a little (no room-coloured fringe).
    vec2 cuv = uCrop + lens * uCropHalf;
    float person = 0.0;
    if (uHasMask > 0.5 && cuv.x > 0.0 && cuv.x < 1.0 && cuv.y > 0.0 && cuv.y < 1.0) {
      float m = texture2D(uMask, cuv).g * 2.0;
      float wsum = 2.0;
      for (int j = 0; j < 12; j++) {
        float a12 = float(j) * 0.5235988;
        float ring = j < 6 ? 0.5 : 1.0;
        vec2 o = vec2(cos(a12 + ring), sin(a12 + ring)) * uErode * ring;
        m += texture2D(uMask, cuv + o).g;
        wsum += 1.0;
      }
      m /= wsum;
      // Fade out softly where the crop runs past the frame's sides.
      float inside = smoothstep(0.0, 0.035, cuv.x) * smoothstep(1.0, 0.965, cuv.x);
      person = smoothstep(uEdge.x, uEdge.y, m) * inside;
      if (person > 0.0) {
        vec3 c = texture2D(uCamera, cuv).rgb;
        if (uCameraLinear < 0.5) c = fromSrgb(c);
        col = mix(col, c, person);
      }
    }

    // The film: a swirling rainbow, strongest toward the rim.
    float rim = smoothstep(0.5, 1.0, d);
    float swirl = sin(ang * 2.0 + d * 7.0 - uTime * 0.7 + uPhase) * 0.5 + 0.5;
    vec3 irid = film(d * 1.3 + swirl * 0.55 + uTime * 0.05 + uPhase * 0.1);
    col = mix(col, col * 0.75 + irid * 0.55, rim * (0.75 - 0.35 * person));
    col += irid * 0.08 * (1.0 - rim);
    // A bright rim line.
    col += vec3(1.0) * smoothstep(0.86, 1.0, d) * 0.4;
    // Highlights: a big soft window reflection top-left, a small one bottom-right.
    vec2 h1 = q - vec2(-0.42, 0.46);
    float c1 = cos(0.6);
    float s1 = sin(0.6);
    h1 = vec2(c1 * h1.x - s1 * h1.y, s1 * h1.x + c1 * h1.y);
    col += smoothstep(0.26, 0.05, length(h1 * vec2(1.0, 2.0))) * 0.85;
    col += smoothstep(0.1, 0.0, length(q - vec2(0.5, -0.52))) * 0.6;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

/** Points in design px, straight to clip space (droplets, hand dots). */
export const pointsVert = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  attribute float alpha;
  uniform vec2 uDesign;
  uniform float uPxScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    gl_PointSize = size * uPxScale;
    gl_Position = vec4(position.x / uDesign.x * 2.0 - 1.0, 1.0 - position.y / uDesign.y * 2.0, 0.0, 1.0);
  }
`;

/** A droplet: a tinted glassy dot with a white glint. */
export const dropletFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    if (d > 1.0) discard;
    float body = smoothstep(1.0, 0.75, d);
    float rimLight = smoothstep(0.55, 0.95, d) * body;
    float glint = smoothstep(0.32, 0.0, length(p - vec2(-0.17, -0.17)));
    vec3 col = mix(vColor * 0.85 + 0.25, vec3(1.0), max(rimLight * 0.5, glint));
    gl_FragColor = vec4(col, body * vAlpha * (0.55 + 0.45 * max(rimLight, glint)));
    #include <colorspace_fragment>
  }
`;

/** A hand dot: a white-centred violet disc with a soft halo (reads on the pastel sky). */
export const dotFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float disc = smoothstep(0.78, 0.62, d);
    float halo = smoothstep(1.0, 0.7, d) * 0.35;
    vec3 col = mix(vColor, vec3(1.0), smoothstep(0.55, 0.15, d));
    gl_FragColor = vec4(col, max(disc, halo) * vAlpha);
    #include <colorspace_fragment>
  }
`;
