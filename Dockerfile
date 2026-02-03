FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install scanners and set raw-socket capability for masscan
RUN apt-get update && \
  apt-get install -y --no-install-recommends masscan nmap ca-certificates libcap2-bin && \
  setcap cap_net_raw+ep /usr/bin/masscan && \
  setcap cap_net_raw+ep /usr/bin/nmap && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm install --production=false || true

COPY tsconfig.json .eslintrc.cjs .prettierrc ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build

CMD ["node", "dist/index.js"]
