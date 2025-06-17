FROM denoland/deno:1.42.4

WORKDIR /app

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Copy dependency files
COPY deno.json .
COPY src/ ./src/

# Copy .env file if it exists (optional)
COPY .env* ./

# Cache dependencies
RUN deno cache src/server.ts

# Set default environment variables (can be overridden)
ENV PORT=8080
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
CMD curl -f http://localhost:8080/health || exit 1

# Start the server
CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "--allow-ffi", "src/server.ts"]
