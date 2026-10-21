import bcrypt from "bcryptjs";

// Kept free of next/* imports so scripts (like the seed) can use it outside a request.
export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
