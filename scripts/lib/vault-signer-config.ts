import { isAbsolute, relative, resolve, sep } from "node:path";

/** Railway must use its mounted volume; local development keeps loopback defaults. */
export function signerNetworkConfig(env: NodeJS.ProcessEnv) {
  const host = env.PRAXIS_SIGNER_HOST ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "0.0.0.0") throw new Error("Invalid signer bind address");
  const port = Number(env.PORT ?? env.PRAXIS_SIGNER_PORT ?? "4317");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid signer port");
  const directory = env.PRAXIS_SIGNER_DIRECTORY;
  if (!directory || !isAbsolute(directory)) throw new Error("Signer directory must be an absolute path");
  let mount: string | undefined;
  if (env.RAILWAY_ENVIRONMENT_ID) {
    mount = env.RAILWAY_VOLUME_MOUNT_PATH;
    if (!mount || !isAbsolute(mount) || /\s|\\/.test(mount)) throw new Error("Railway requires a persistent signer volume");
    const child = relative(resolve(mount), resolve(directory));
    if (!child || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) throw new Error("Signer keys must be inside the Railway volume");
  }
  return { host, port, directory, mount };
}

export function assertMountedVolume(mount: string, mountInfo: string) {
  if (!mountInfo.split("\n").some((line) => line.split(" ")[4] === resolve(mount))) throw new Error("Signer volume is not mounted; refusing ephemeral key storage");
}
