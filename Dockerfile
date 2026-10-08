FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN python3 -m venv /opt/kicomav \
  && /opt/kicomav/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/kicomav/bin/pip install --no-cache-dir -r requirements-kicomav.txt

RUN npm install -g corepack@latest \
  && corepack pnpm install \
  && corepack pnpm run build

ENV NODE_ENV=production
ENV PYTHONPATH=/app/vendor
ENV KICOMAV_PYTHON=/opt/kicomav/bin/python
CMD ["node", "dist/index.js"]
