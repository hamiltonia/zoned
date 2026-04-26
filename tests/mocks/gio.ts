/**
 * Mock Gio module for unit testing outside GJS runtime
 */

export class Settings {
    private _values: Record<string, unknown> = {};

    get_boolean(key: string): boolean {
        return (this._values[key] as boolean) ?? false;
    }

    get_string(key: string): string {
        return (this._values[key] as string) ?? '';
    }

    set_string(key: string, value: string): void {
        this._values[key] = value;
    }

    connect(_signal: string, _callback: (...args: unknown[]) => void): number {
        return 0;
    }

    disconnect(_id: number): void {
        // no-op
    }
}

export const File = {
    new_for_path(_path: string) {
        return {
            query_exists(_cancellable: unknown): boolean {
                return false;
            },
            load_contents(_cancellable: unknown): [boolean, Uint8Array] {
                return [false, new Uint8Array()];
            },
        };
    },
};

export default {Settings, File};
