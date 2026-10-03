FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=25555 MAX_ROOMS=2
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node backend ./backend
COPY --chown=node:node frontend ./frontend
USER node
EXPOSE 25555
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:25555/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/server.mjs"]
