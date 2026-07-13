(function () {
  "use strict";

  const OPTIONS = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    desynchronized: true,
    failIfMajorPerformanceCaveat: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false
  };

  const VERTEX_300 = `#version 300 es
    in vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
  `;

  const VERTEX_100 = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
  `;

  const FRAGMENT_BODY = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_pixelRatio;
    uniform float u_time;
    uniform float u_coreSize;
    uniform float u_overclock;
    uniform float u_celestial;
    uniform float u_dark;

    float hash21(vec2 value) {
      value = fract(value * vec2(123.34, 456.21));
      value += dot(value, value + 45.32);
      return fract(value.x * value.y);
    }

    vec4 forgeColor() {
      vec2 resolution = u_resolution / u_pixelRatio;
      vec2 pixel = gl_FragCoord.xy / u_pixelRatio;
      vec2 uv = pixel / max(vec2(1.0), resolution);
      vec2 center = vec2(resolution.x * 0.5, resolution.y * 0.53);
      vec2 point = pixel - center;
      float time = u_time * 0.001;

      vec3 low = vec3(0.045, 0.086, 0.130);
      vec3 high = vec3(0.120, 0.190, 0.245);
      vec3 color = mix(low, high, smoothstep(0.0, 1.0, uv.y));

      float nebulaA = exp(-dot(point - vec2(resolution.x * 0.22, 30.0), point - vec2(resolution.x * 0.22, 30.0)) / max(1.0, resolution.x * resolution.y * 0.34));
      float nebulaB = exp(-dot(point + vec2(resolution.x * 0.28, 80.0), point + vec2(resolution.x * 0.28, 80.0)) / max(1.0, resolution.x * resolution.y * 0.28));
      color += vec3(0.035, 0.170, 0.145) * nebulaA * 0.38;
      color += vec3(0.180, 0.090, 0.210) * nebulaB * (0.16 + u_dark * 0.05);

      vec2 starWorld = pixel + vec2(u_time * 0.012, 0.0);
      vec2 starCell = floor(starWorld / 62.0);
      vec2 starLocal = fract(starWorld / 62.0);
      vec2 starPosition = vec2(hash21(starCell + 3.1), hash21(starCell + 17.7));
      float starSeed = hash21(starCell);
      float starDistance = length(starLocal - starPosition);
      float star = (1.0 - smoothstep(0.014, 0.042, starDistance)) * step(0.44, starSeed);
      star *= 0.48 + 0.52 * sin(time * 1.8 + starSeed * 30.0);
      color += mix(vec3(0.55, 0.82, 0.75), vec3(1.0, 0.86, 0.48), step(0.78, starSeed)) * star * 0.32;

      float pulse = 1.0 + sin(time * 4.0) * 0.05 + u_overclock * 0.05;
      float ellipseDistance = length(vec2(point.x, point.y / 0.42));
      for (int index = 0; index < 6; index++) {
        float radius = (90.0 + float(index) * 38.0) * pulse;
        float ring = 1.0 - smoothstep(1.1, 2.7, abs(ellipseDistance - radius));
        vec3 ringColor = mix(vec3(0.25, 0.66, 0.57), vec3(0.70, 0.53, 1.0), u_overclock);
        color += ringColor * ring * (0.105 + float(index) * 0.006);
      }

      float celestialRadius = 286.0 + mod(floor(ellipseDistance / 12.0), 4.0) * 12.0;
      float angle = atan(point.y / 0.42, point.x);
      float celestialRing = 1.0 - smoothstep(1.0, 2.4, abs(ellipseDistance - celestialRadius));
      float constellation = step(0.72, sin(angle * (6.0 + min(30.0, u_celestial)) - time * 0.9) * 0.5 + 0.5);
      color += vec3(0.66, 0.78, 1.0) * celestialRing * constellation * min(0.34, u_celestial * 0.018);

      float coreDistance = length(point);
      float coreGlow = exp(-coreDistance / max(18.0, u_coreSize * 1.15));
      vec3 coreGold = mix(vec3(0.88, 0.42, 0.25), vec3(0.70, 0.57, 1.0), u_overclock);
      color += coreGold * coreGlow * 0.62;
      float core = 1.0 - smoothstep(u_coreSize * 0.72, u_coreSize, coreDistance);
      float highlight = exp(-length(point + vec2(u_coreSize * 0.28, u_coreSize * 0.30)) / max(4.0, u_coreSize * 0.24));
      color = mix(color, coreGold, core * 0.88);
      color += vec3(1.0, 0.98, 0.84) * highlight * core * 0.7;

      float vortex = (1.0 - smoothstep(250.0, 360.0, ellipseDistance)) * u_dark;
      color += vec3(0.22, 0.14, 0.38) * vortex * (0.025 + 0.018 * sin(angle * 3.0 + time));

      float vignette = smoothstep(1.0, 0.26, length(uv - 0.5));
      color *= 0.72 + vignette * 0.28;
      return vec4(color, 1.0);
    }
  `;

  const FRAGMENT_300 = `#version 300 es
    ${FRAGMENT_BODY}
    out vec4 outColor;
    void main() { outColor = forgeColor(); }
  `;

  const FRAGMENT_100 = `
    ${FRAGMENT_BODY}
    void main() { gl_FragColor = forgeColor(); }
  `;

  class StarforgeGpuRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = null;
      this.program = null;
      this.buffer = null;
      this.position = -1;
      this.locations = {};
      this.pixelRatio = 1;
      this.active = false;
      this.backend = "Canvas 2D";
      this.device = "浏览器默认渲染器";
      this.contextLost = false;

      canvas.addEventListener("webglcontextlost", event => {
        event.preventDefault();
        this.contextLost = true;
        this.active = false;
      });
      canvas.addEventListener("webglcontextrestored", () => {
        this.contextLost = false;
        this.initialize();
      });
      this.initialize();
    }

    initialize() {
      let gl = null;
      let webgl2 = false;
      try {
        gl = this.canvas.getContext("webgl2", OPTIONS);
        webgl2 = Boolean(gl);
        if (!gl) gl = this.canvas.getContext("webgl", OPTIONS);
      } catch (_error) {
        gl = null;
      }
      if (!gl) return;

      this.gl = gl;
      this.backend = webgl2 ? "WebGL2" : "WebGL";
      try {
        const vertex = this.compile(gl.VERTEX_SHADER, webgl2 ? VERTEX_300 : VERTEX_100);
        const fragment = this.compile(gl.FRAGMENT_SHADER, webgl2 ? FRAGMENT_300 : FRAGMENT_100);
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);

        this.program = program;
        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        this.position = gl.getAttribLocation(program, "a_position");
        this.locations = {
          resolution: gl.getUniformLocation(program, "u_resolution"),
          pixelRatio: gl.getUniformLocation(program, "u_pixelRatio"),
          time: gl.getUniformLocation(program, "u_time"),
          coreSize: gl.getUniformLocation(program, "u_coreSize"),
          overclock: gl.getUniformLocation(program, "u_overclock"),
          celestial: gl.getUniformLocation(program, "u_celestial"),
          dark: gl.getUniformLocation(program, "u_dark")
        };
        const debug = gl.getExtension("WEBGL_debug_renderer_info");
        this.device = String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).replace(/\s+/g, " ").trim();
        this.active = true;
      } catch (error) {
        this.active = false;
        console.warn("Starforge GPU renderer unavailable; using Canvas fallback.", error);
      }
    }

    compile(type, source) {
      const shader = this.gl.createShader(type);
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);
      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        const message = this.gl.getShaderInfoLog(shader) || "shader compile failed";
        this.gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    }

    resize(width, height, pixelRatio) {
      this.pixelRatio = Math.max(0.7, pixelRatio || 1);
      const targetWidth = Math.max(1, Math.floor(width * this.pixelRatio));
      const targetHeight = Math.max(1, Math.floor(height * this.pixelRatio));
      if (this.canvas.width !== targetWidth) this.canvas.width = targetWidth;
      if (this.canvas.height !== targetHeight) this.canvas.height = targetHeight;
    }

    render(frame) {
      if (!this.active || this.contextLost || !this.gl || !this.program) return false;
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.enableVertexAttribArray(this.position);
      gl.vertexAttribPointer(this.position, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(this.locations.resolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.locations.pixelRatio, this.pixelRatio);
      gl.uniform1f(this.locations.time, frame.time);
      gl.uniform1f(this.locations.coreSize, frame.coreSize);
      gl.uniform1f(this.locations.overclock, frame.overclock ? 1 : 0);
      gl.uniform1f(this.locations.celestial, frame.celestial || 0);
      gl.uniform1f(this.locations.dark, Math.min(1, Math.log10((frame.dark || 0) + 1) / 4));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    }

    info() {
      return { active: this.active, backend: this.backend, device: this.device, webgpuAvailable: Boolean(navigator.gpu) };
    }
  }

  window.StarforgeGpuRenderer = StarforgeGpuRenderer;
})();
