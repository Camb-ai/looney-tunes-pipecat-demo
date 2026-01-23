# Build frontend
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Backend
FROM python:3.12-slim
WORKDIR /app

# Install uv
RUN pip install uv

# Copy backend
COPY backend/ ./backend/
WORKDIR /app/backend
RUN uv sync

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 7860

CMD ["uv", "run", "python", "server.py"]
