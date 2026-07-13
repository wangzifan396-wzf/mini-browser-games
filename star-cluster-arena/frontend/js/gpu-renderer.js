(function () {
  "use strict";

  const CONTEXT_OPTIONS = {
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
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const FRAGMENT_BODY = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform vec2 u_camera;
    uniform float u_zoom;
    uniform float u_pixelRatio;
    uniform float u_time;

    float hash21(vec2 value) {
      value = fract(value * vec2(123.34, 456.21));
      value += dot(value, value + 45.32);
      return fract(value.x * value.y);
    }

    float gridLine(vec2 world, float spacing, float cssWidth) {
      vec2 cell = fract(world / spacing);
      vec2 edge = min(cell, 1.0 - cell);
      float width = cssWidth / max(1.0, spacing * u_zoom);
      return 1.0 - smoothstep(width * 0.35, width * 1.45, min(edge.x, edge.y));
    }

    vec4 arenaColor() {
      vec2 cssResolution = u_resolution / u_pixelRatio;
      vec2 cssPixel = gl_FragCoord.xy / u_pixelRatio;
      vec2 centered = cssPixel - cssResolution * 0.5;
      vec2 world = u_camera + vec2(centered.x, -centered.y) / max(0.08, u_zoom);
      vec2 uv = cssPixel / max(vec2(1.0), cssResolution);

      vec3 top = vec3(0.018, 0.061, 0.078);
      vec3 bottom = vec3(0.010, 0.025, 0.043);
      vec3 color = mix(bottom, top, smoothstep(0.0, 1.0, uv.y));

      float centerGlow = exp(-dot(centered, centered) / max(1.0, dot(cssResolution, cssResolution) * 0.18));
      color += vec3(0.040, 0.190, 0.165) * centerGlow * (0.26 + 0.035 * sin(u_time * 0.0012));

      float smallGrid = gridLine(world, 70.0, 0.72);
      float largeGrid = gridLine(world, 280.0, 1.05);
      color += vec3(0.30, 0.58, 0.55) * smallGrid * 0.050;
      color += vec3(0.28, 0.76, 0.67) * largeGrid * 0.075;

      vec2 starCell = floor(world / 230.0);
      vec2 starLocal = fract(world / 230.0) - 0.5;
      float seed = hash21(starCell);
      vec2 offset = vec2(hash21(starCell + 7.3), hash21(starCell + 19.7)) - 0.5;
      float star = 1.0 - smoothstep(0.006, 0.022, length(starLocal - offset * 0.72));
      star *= step(0.72, seed) * (0.55 + 0.45 * sin(u_time * 0.0018 + seed * 20.0));
      color += vec3(0.56, 0.88, 0.90) * star * 0.20;

      float vignette = smoothstep(0.98, 0.28, length(uv - 0.5));
      color *= 0.72 + vignette * 0.28;
      return vec4(color, 1.0);
    }
  `;

  const FRAGMENT_300 = `#version 300 es
    ${FRAGMENT_BODY}
    out vec4 outColor;
    void main() { outColor = arenaColor(); }
  `;

  const VERTEX_100 = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const FRAGMENT_100 = `
    ${FRAGMENT_BODY}
    void main() { gl_FragColor = arenaColor(); }
  `;

  const SPRITE_VERTEX_300 = `#version 300 es
    precision highp float;
    in vec2 a_world;
    in float a_radius;
    in vec3 a_color;
    in float a_pulse;
    in float a_rich;
    uniform vec2 u_resolution;
    uniform vec2 u_camera;
    uniform float u_zoom;
    uniform float u_pixelRatio;
    uniform float u_time;
    out vec3 v_color;
    out float v_bodyRadius;
    out float v_outerRadius;
    out float v_rich;
    void main() {
      vec2 cssResolution = u_resolution / u_pixelRatio;
      vec2 delta = (a_world - u_camera) * u_zoom;
      gl_Position = vec4(delta.x / (cssResolution.x * 0.5), -delta.y / (cssResolution.y * 0.5), 0.0, 1.0);
      float pulse = 1.0 + sin(u_time / 420.0 + a_pulse) * 0.12;
      float bodyPixels = max(1.5, a_radius * pulse * u_zoom * u_pixelRatio);
      float outerPixels = bodyPixels * mix(1.0, 1.55, a_rich);
      float glowPixels = mix(4.0, 7.0, a_rich) * u_pixelRatio;
      gl_PointSize = max(3.0, (outerPixels + glowPixels) * 2.0);
      float halfSize = gl_PointSize * 0.5;
      v_bodyRadius = bodyPixels / halfSize;
      v_outerRadius = outerPixels / halfSize;
      v_color = a_color;
      v_rich = a_rich;
    }
  `;

  const SPRITE_FRAGMENT_300 = `#version 300 es
    precision highp float;
    in vec3 v_color;
    in float v_bodyRadius;
    in float v_outerRadius;
    in float v_rich;
    out vec4 outColor;
    void main() {
      float distanceFromCenter = length(gl_PointCoord - 0.5) * 2.0;
      float body = 1.0 - smoothstep(v_bodyRadius * 0.82, v_bodyRadius, distanceFromCenter);
      float glow = (1.0 - smoothstep(v_bodyRadius, 1.0, distanceFromCenter)) * 0.28;
      float ring = v_rich * smoothstep(v_outerRadius - 0.09, v_outerRadius - 0.035, distanceFromCenter)
        * (1.0 - smoothstep(v_outerRadius - 0.015, v_outerRadius + 0.035, distanceFromCenter));
      float alpha = body * 0.9 + glow + ring * 0.68;
      if (alpha < 0.008) discard;
      vec3 color = mix(v_color, vec3(1.0), ring * 0.72 + body * 0.08);
      outColor = vec4(color, min(1.0, alpha));
    }
  `;

  const SPRITE_VERTEX_100 = `
    precision highp float;
    attribute vec2 a_world;
    attribute float a_radius;
    attribute vec3 a_color;
    attribute float a_pulse;
    attribute float a_rich;
    uniform vec2 u_resolution;
    uniform vec2 u_camera;
    uniform float u_zoom;
    uniform float u_pixelRatio;
    uniform float u_time;
    varying vec3 v_color;
    varying float v_bodyRadius;
    varying float v_outerRadius;
    varying float v_rich;
    void main() {
      vec2 cssResolution = u_resolution / u_pixelRatio;
      vec2 delta = (a_world - u_camera) * u_zoom;
      gl_Position = vec4(delta.x / (cssResolution.x * 0.5), -delta.y / (cssResolution.y * 0.5), 0.0, 1.0);
      float pulse = 1.0 + sin(u_time / 420.0 + a_pulse) * 0.12;
      float bodyPixels = max(1.5, a_radius * pulse * u_zoom * u_pixelRatio);
      float outerPixels = bodyPixels * mix(1.0, 1.55, a_rich);
      float glowPixels = mix(4.0, 7.0, a_rich) * u_pixelRatio;
      gl_PointSize = max(3.0, (outerPixels + glowPixels) * 2.0);
      float halfSize = gl_PointSize * 0.5;
      v_bodyRadius = bodyPixels / halfSize;
      v_outerRadius = outerPixels / halfSize;
      v_color = a_color;
      v_rich = a_rich;
    }
  `;

  const SPRITE_FRAGMENT_100 = `
    precision highp float;
    varying vec3 v_color;
    varying float v_bodyRadius;
    varying float v_outerRadius;
    varying float v_rich;
    void main() {
      float distanceFromCenter = length(gl_PointCoord - 0.5) * 2.0;
      float body = 1.0 - smoothstep(v_bodyRadius * 0.82, v_bodyRadius, distanceFromCenter);
      float glow = (1.0 - smoothstep(v_bodyRadius, 1.0, distanceFromCenter)) * 0.28;
      float ring = v_rich * smoothstep(v_outerRadius - 0.09, v_outerRadius - 0.035, distanceFromCenter)
        * (1.0 - smoothstep(v_outerRadius - 0.015, v_outerRadius + 0.035, distanceFromCenter));
      float alpha = body * 0.9 + glow + ring * 0.68;
      if (alpha < 0.008) discard;
      vec3 color = mix(v_color, vec3(1.0), ring * 0.72 + body * 0.08);
      gl_FragColor = vec4(color, min(1.0, alpha));
    }
  `;

  class GPUArenaRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = null;
      this.program = null;
      this.backend = "Canvas 2D";
      this.device = "浏览器默认渲染器";
      this.active = false;
      this.contextLost = false;
      this.locations = {};
      this.pixelRatio = 1;
      this.backgroundBuffer = null;
      this.backgroundPosition = -1;
      this.spriteProgram = null;
      this.spriteBuffer = null;
      this.spriteLocations = {};
      this.spriteData = new Float32Array(0);
      this.spriteCapacity = 0;
      this.colorCache = new Map();
      this.supportsSprites = false;
      this.webgl2 = false;

      canvas.addEventListener("webglcontextlost", event => {
        event.preventDefault();
        this.contextLost = true;
        this.active = false;
      });
      canvas.addEventListener("webglcontextrestored", () => {
        this.contextLost = false;
        this.setup(this.gl, this.backend === "WebGL2");
      });

      this.initialize();
    }

    initialize() {
      let gl = null;
      let webgl2 = false;
      try {
        gl = this.canvas.getContext("webgl2", CONTEXT_OPTIONS);
        webgl2 = Boolean(gl);
        if (!gl) gl = this.canvas.getContext("webgl", CONTEXT_OPTIONS);
      } catch (_error) {
        gl = null;
      }

      if (!gl) {
        this.canvas.hidden = true;
        return;
      }

      this.gl = gl;
      this.webgl2 = webgl2;
      this.backend = webgl2 ? "WebGL2" : "WebGL";
      this.setup(gl, webgl2);
    }

    setup(gl, webgl2) {
      try {
        const vertex = this.compile(gl.VERTEX_SHADER, webgl2 ? VERTEX_300 : VERTEX_100);
        const fragment = this.compile(gl.FRAGMENT_SHADER, webgl2 ? FRAGMENT_300 : FRAGMENT_100);
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program) || "GPU program link failed");
        }
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);

        const vertices = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

        this.program = program;
        this.backgroundBuffer = vertices;
        this.backgroundPosition = position;
        this.locations = {
          resolution: gl.getUniformLocation(program, "u_resolution"),
          camera: gl.getUniformLocation(program, "u_camera"),
          zoom: gl.getUniformLocation(program, "u_zoom"),
          pixelRatio: gl.getUniformLocation(program, "u_pixelRatio"),
          time: gl.getUniformLocation(program, "u_time")
        };

        this.setupSpriteRenderer(gl, webgl2);

        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        this.device = debugInfo
          ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER) || "GPU";
        this.device = String(this.device).replace(/\s+/g, " ").trim();
        this.canvas.hidden = false;
        this.active = true;
      } catch (error) {
        console.warn("GPU renderer unavailable; Canvas 2D fallback enabled.", error);
        this.canvas.hidden = true;
        this.active = false;
      }
    }

    setupSpriteRenderer(gl, webgl2) {
      try {
        const vertex = this.compile(gl.VERTEX_SHADER, webgl2 ? SPRITE_VERTEX_300 : SPRITE_VERTEX_100);
        const fragment = this.compile(gl.FRAGMENT_SHADER, webgl2 ? SPRITE_FRAGMENT_300 : SPRITE_FRAGMENT_100);
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program) || "GPU sprite program link failed");
        }
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);

        this.spriteProgram = program;
        this.spriteBuffer = gl.createBuffer();
        this.spriteCapacity = 0;
        this.spriteData = new Float32Array(0);
        this.spriteLocations = {
          world: gl.getAttribLocation(program, "a_world"),
          radius: gl.getAttribLocation(program, "a_radius"),
          color: gl.getAttribLocation(program, "a_color"),
          pulse: gl.getAttribLocation(program, "a_pulse"),
          rich: gl.getAttribLocation(program, "a_rich"),
          resolution: gl.getUniformLocation(program, "u_resolution"),
          camera: gl.getUniformLocation(program, "u_camera"),
          zoom: gl.getUniformLocation(program, "u_zoom"),
          pixelRatio: gl.getUniformLocation(program, "u_pixelRatio"),
          time: gl.getUniformLocation(program, "u_time")
        };
        this.supportsSprites = true;
      } catch (error) {
        this.supportsSprites = false;
        console.warn("GPU sprite batching unavailable; Canvas food rendering enabled.", error);
      }
    }

    compile(type, source) {
      const shader = this.gl.createShader(type);
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);
      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        const message = this.gl.getShaderInfoLog(shader) || "GPU shader compile failed";
        this.gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    }

    resize(width, height, pixelRatio) {
      this.pixelRatio = Math.max(0.75, pixelRatio || 1);
      const targetWidth = Math.max(1, Math.floor(width * this.pixelRatio));
      const targetHeight = Math.max(1, Math.floor(height * this.pixelRatio));
      if (this.canvas.width !== targetWidth) this.canvas.width = targetWidth;
      if (this.canvas.height !== targetHeight) this.canvas.height = targetHeight;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }

    render(state) {
      if (!this.active || !this.gl || !this.program || this.contextLost) return false;
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.backgroundBuffer);
      gl.enableVertexAttribArray(this.backgroundPosition);
      gl.vertexAttribPointer(this.backgroundPosition, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(this.locations.resolution, this.canvas.width, this.canvas.height);
      gl.uniform2f(this.locations.camera, state.camera.x, state.camera.y);
      gl.uniform1f(this.locations.zoom, state.zoom);
      gl.uniform1f(this.locations.pixelRatio, this.pixelRatio);
      gl.uniform1f(this.locations.time, state.time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (this.supportsSprites && state.foods && state.foods.length) {
        this.renderFoodSprites(state.foods, state);
      }
      return true;
    }

    renderFoodSprites(foods, state) {
      const gl = this.gl;
      const floatsPerSprite = 8;
      const needed = foods.length * floatsPerSprite;
      if (needed > this.spriteCapacity) {
        this.spriteCapacity = Math.max(needed, Math.max(1024, this.spriteCapacity * 2));
        this.spriteData = new Float32Array(this.spriteCapacity);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.spriteData.byteLength, gl.DYNAMIC_DRAW);
      }

      let offset = 0;
      for (const food of foods) {
        let color = this.colorCache.get(food.color);
        if (!color) {
          const value = Number.parseInt(String(food.color).replace("#", ""), 16);
          color = [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255];
          this.colorCache.set(food.color, color);
        }
        this.spriteData[offset++] = food.x;
        this.spriteData[offset++] = food.y;
        this.spriteData[offset++] = food.radius;
        this.spriteData[offset++] = color[0];
        this.spriteData[offset++] = color[1];
        this.spriteData[offset++] = color[2];
        this.spriteData[offset++] = food.pulse;
        this.spriteData[offset++] = food.rich ? 1 : 0;
      }

      const locations = this.spriteLocations;
      const stride = floatsPerSprite * 4;
      gl.useProgram(this.spriteProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
      if (this.webgl2) gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.spriteData, 0, needed);
      else gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.spriteData.subarray(0, needed));
      gl.enableVertexAttribArray(locations.world);
      gl.vertexAttribPointer(locations.world, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(locations.radius);
      gl.vertexAttribPointer(locations.radius, 1, gl.FLOAT, false, stride, 8);
      gl.enableVertexAttribArray(locations.color);
      gl.vertexAttribPointer(locations.color, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(locations.pulse);
      gl.vertexAttribPointer(locations.pulse, 1, gl.FLOAT, false, stride, 24);
      gl.enableVertexAttribArray(locations.rich);
      gl.vertexAttribPointer(locations.rich, 1, gl.FLOAT, false, stride, 28);
      gl.uniform2f(locations.resolution, this.canvas.width, this.canvas.height);
      gl.uniform2f(locations.camera, state.camera.x, state.camera.y);
      gl.uniform1f(locations.zoom, state.zoom);
      gl.uniform1f(locations.pixelRatio, this.pixelRatio);
      gl.uniform1f(locations.time, state.time);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, foods.length);
      gl.disable(gl.BLEND);
    }

    info() {
      return {
        active: this.active,
        backend: this.backend,
        device: this.device,
        spriteBatching: this.supportsSprites,
        webgpuAvailable: Boolean(navigator.gpu)
      };
    }
  }

  window.GPUArenaRenderer = GPUArenaRenderer;
})();
