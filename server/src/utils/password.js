import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export const hashPasswordSync = (plain) => bcrypt.hashSync(plain, ROUNDS);
export const verifyPasswordSync = (plain, hash) => bcrypt.compareSync(plain, hash);

export const hashPassword = (plain) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);
