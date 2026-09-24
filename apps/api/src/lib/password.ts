import argon2 from "argon2";

export const hashPassword = (plain: string) => argon2.hash(plain);
export const verifyPassword = (plain: string, hash: string) => argon2.verify(hash, plain);
