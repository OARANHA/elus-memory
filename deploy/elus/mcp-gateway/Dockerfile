FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node --chmod=644 package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY --chown=node:node --chmod=644 server.mjs ./
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
