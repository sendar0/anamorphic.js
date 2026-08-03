/* A minimal observable.

   Svelte's `$store` syntax works with anything exposing
   `subscribe(fn) => unsubscribe`, where fn is called immediately with the
   current value. That is the whole contract, so implementing it here costs
   sixty lines and buys the core a life outside Svelte: any framework, or
   none, can call `anaMode.subscribe(...)` and get the same thing. */

export type Subscriber<T> = (value: T) => void;
export type Unsubscriber = () => void;

export interface Readable<T> {
	subscribe(run: Subscriber<T>): Unsubscriber;
	/** the current value, without subscribing */
	get(): T;
}

export interface Writable<T> extends Readable<T> {
	set(value: T): void;
	update(fn: (value: T) => T): void;
}

export function writable<T>(initial: T): Writable<T> {
	let value = initial;
	const subscribers = new Set<Subscriber<T>>();

	return {
		get: () => value,
		set(next: T) {
			if (Object.is(value, next)) return;
			value = next;
			for (const run of subscribers) run(value);
		},
		update(fn) {
			this.set(fn(value));
		},
		subscribe(run) {
			subscribers.add(run);
			run(value);
			return () => subscribers.delete(run);
		}
	};
}

/** Combines stores into one. Kept deliberately small: eager, synchronous,
    and only what the engine actually needs. */
export function derived<S extends Readable<unknown>[], T>(
	stores: [...S],
	fn: (values: { [K in keyof S]: S[K] extends Readable<infer V> ? V : never }) => T
): Readable<T> {
	type Values = Parameters<typeof fn>[0];
	const read = () => fn(stores.map((s) => s.get()) as Values);
	const subscribers = new Set<Subscriber<T>>();
	let unsubscribers: Unsubscriber[] = [];

	return {
		get: read,
		subscribe(run) {
			if (subscribers.size === 0) {
				const notify = () => {
					const value = read();
					for (const s of subscribers) s(value);
				};
				unsubscribers = stores.map((s) => s.subscribe(notify));
			}
			subscribers.add(run);
			run(read());
			return () => {
				subscribers.delete(run);
				if (subscribers.size === 0) {
					for (const u of unsubscribers) u();
					unsubscribers = [];
				}
			};
		}
	};
}
