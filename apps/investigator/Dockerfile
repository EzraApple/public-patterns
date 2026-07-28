FROM docker.io/cloudflare/sandbox:0.12.4-python

RUN npm install --global @opencode-ai/cli@0.0.0-next-16303 \
    && rm -rf \
        /root/.npm \
        /usr/local/lib/node_modules/@opencode-ai/cli/node_modules/@opencode-ai/cli-linux-x64-baseline \
        /usr/local/lib/node_modules/@opencode-ai/cli/node_modules/@opencode-ai/cli-linux-x64-baseline-musl \
        /usr/local/lib/node_modules/@opencode-ai/cli/node_modules/@opencode-ai/cli-linux-x64-musl

COPY agent /workspace
RUN cd /workspace/.opencode \
    && npm ci --omit=dev \
    && npm cache clean --force

WORKDIR /workspace
