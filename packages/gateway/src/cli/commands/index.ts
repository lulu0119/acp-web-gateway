import { agent } from "./agent/index.js";
import { config } from "./config.js";
import { daemon } from "./daemon.js";
import { login } from "./login.js";
import { logout } from "./logout.js";
import { registry } from "./registry/index.js";
import { status } from "./status.js";

export const commandTree = [login, logout, status, daemon, agent, registry, config];
