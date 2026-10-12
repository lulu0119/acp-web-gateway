import { agentConfig } from "./agent-config/index.js";
import { daemon } from "./daemon.js";
import { login } from "./login.js";
import { logout } from "./logout.js";
import { status } from "./status.js";

export const commandTree = [login, logout, status, daemon, agentConfig];
