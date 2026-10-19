import {
  httpsCallable as firebaseCallable,
  httpsCallableFromURL,
  type Functions,
  type HttpsCallableOptions,
} from 'firebase/functions';

// Keep Firebase's token handling, wire protocol and error codes on both hosts.
// Fixture/audit builds keep their isolated Firebase transport.
export function httpsCallable<Request = unknown, Response = unknown>(
  functions: Functions,
  name: string,
  options?: HttpsCallableOptions,
) {
  if (import.meta.env.MODE === 'production') {
    const url = new URL('/api/rpc', window.location.origin);
    url.searchParams.set('name', name);
    return httpsCallableFromURL<Request, Response>(functions, url.href, options);
  }
  return firebaseCallable<Request, Response>(functions, name, options);
}
