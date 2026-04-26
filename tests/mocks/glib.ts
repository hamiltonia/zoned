/**
 * Mock GLib module for unit testing outside GJS runtime
 */

export function build_filenamev(parts: string[]): string {
    return parts.join('/');
}

export default {build_filenamev};
