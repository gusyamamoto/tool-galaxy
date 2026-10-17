// Shared local UUID generation; never substitute predictable IDs for entropy.
const cosmifoldIds = {
    uuid() {
        const random = globalThis.crypto;
        if (typeof random?.randomUUID === 'function') return random.randomUUID();
        if (typeof random?.getRandomValues !== 'function')
            throw new Error('This browser cannot create new items or files. Try an updated browser or open Cosmifold over HTTPS.');
        const bytes = random.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }
};
