FROM docker.io/cloudflare/sandbox:0.12.4-python

RUN npm install --global @opencode-ai/cli@0.0.0-next-16303

COPY agent /workspace
RUN cd /workspace/.opencode && npm ci --omit=dev

WORKDIR /workspace
