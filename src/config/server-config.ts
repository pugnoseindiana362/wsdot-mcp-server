/**
 * @fileoverview Server-specific environment variable configuration for wsdot-mcp-server.
 * @module config/server-config
 */

import { z } from '@cyanheads/mcp-ts-core';
import { parseEnvConfig } from '@cyanheads/mcp-ts-core/config';

const ServerConfigSchema = z.object({
  accessCode: z
    .string()
    .describe('WSDOT Traveler API access code. Used for both traffic and ferry endpoints.'),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

let _config: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  _config ??= parseEnvConfig(ServerConfigSchema, {
    accessCode: 'WSDOT_ACCESS_CODE',
  });
  return _config;
}
