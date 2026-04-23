# Build stage
# Pinned to a specific digest for supply-chain security.
# To update: run `docker pull docker.io/library/node:20-slim` and use
# `docker inspect --format='{{index .RepoDigests 0}}' docker.io/library/node:20-slim`
FROM docker.io/library/node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  git \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Set up npm global package folder
RUN mkdir -p /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Copy source code
COPY . /home/node/app
WORKDIR /home/node/app

# Install dependencies, build workspaces, bundle into a single distributable, and pack
RUN npm ci \
  && npm run build \
  && npm run bundle \
  && npm run prepare:package \
  && cd dist && npm pack

# Runtime stage
# Must match the digest pinned in the builder stage above.
FROM docker.io/library/node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

ARG SANDBOX_NAME="qwen-code-sandbox"
ARG CLI_VERSION_ARG
ENV SANDBOX="$SANDBOX_NAME"
ENV CLI_VERSION=$CLI_VERSION_ARG

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  man-db \
  curl \
  dnsutils \
  less \
  jq \
  bc \
  gh \
  git \
  unzip \
  rsync \
  ripgrep \
  procps \
  psmisc \
  lsof \
  socat \
  ca-certificates \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Set up npm global package folder
RUN mkdir -p /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Copy bundled package from builder stage
COPY --from=builder /home/node/app/dist/*.tgz /tmp/

# Install built packages globally
RUN npm install -g /tmp/*.tgz \
  && npm cache clean --force \
  && rm -rf /tmp/*.tgz

# Default entrypoint when none specified
CMD ["qwen"]
