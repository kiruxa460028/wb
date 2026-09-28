#!/usr/bin/env python3
"""
Смена пароля пользователя в базе WB Supply Planner.

В самом приложении смены пароля нет — есть только вход и регистрация.
Этот скрипт меняет пароль напрямую в data/app.db: генерирует новую соль
и пересчитывает PBKDF2-хэш ровно теми же параметрами, что и оба сервера
(PBKDF2-HMAC-SHA256, 120 000 итераций, 32 байта), поэтому новый пароль
сразу работает и в server.js, и в server.py.

Примеры:
    python3 scripts/set_password.py --list
    python3 scripts/set_password.py xunlu_
    python3 scripts/set_password.py xunlu_ --db /путь/к/app.db
"""

import argparse
import getpass
import hashlib
import os
import secrets
import sqlite3
import sys

PBKDF2_ITERATIONS = 120_000
PBKDF2_DKLEN = 32
MIN_PASSWORD_LENGTH = 6

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(PROJECT_ROOT, "data", "app.db")


def hash_password(password: str, salt_hex: str) -> str:
    """Тот же алгоритм, что в server.py и server.js."""
    salt = bytes.fromhex(salt_hex)
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS, PBKDF2_DKLEN
    ).hex()


def connect(db_path: str) -> sqlite3.Connection:
    if not os.path.exists(db_path):
        sys.exit(f"Ошибка: база не найдена: {db_path}")
    conn = sqlite3.connect(db_path)
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "users" not in tables:
        sys.exit(f"Ошибка: в базе нет таблицы users: {db_path}")
    return conn


def list_users(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT username_key, username_display, created_at FROM users ORDER BY id"
    ).fetchall()
    if not rows:
        print("В базе нет ни одного пользователя.")
        return
    print(f"{'ЛОГИН':<24} {'ОТОБРАЖАЕМОЕ ИМЯ':<24} СОЗДАН")
    print("-" * 68)
    for key, display, created in rows:
        print(f"{key:<24} {display:<24} {created}")


def read_new_password() -> str:
    first = getpass.getpass("Новый пароль: ")
    if len(first) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Ошибка: пароль должен быть не короче {MIN_PASSWORD_LENGTH} символов.")
    second = getpass.getpass("Повторите пароль: ")
    if first != second:
        sys.exit("Ошибка: пароли не совпадают.")
    return first


def set_password(conn: sqlite3.Connection, username: str, password: str) -> None:
    username_key = (username or "").strip().lower()
    row = conn.execute(
        "SELECT username_display FROM users WHERE username_key = ?", (username_key,)
    ).fetchone()
    if not row:
        sys.exit(f"Ошибка: пользователь '{username_key}' не найден. Список: --list")

    salt_hex = secrets.token_hex(16)
    conn.execute(
        "UPDATE users SET salt = ?, password_hash = ? WHERE username_key = ?",
        (salt_hex, hash_password(password, salt_hex), username_key),
    )
    conn.commit()
    print(f"Готово: пароль пользователя '{username_key}' изменён.")
    print("Новая соль сгенерирована, старый хэш больше не действует.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Смена пароля пользователя в базе WB Supply Planner.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("username", nargs="?", help="логин пользователя")
    parser.add_argument("--db", default=DEFAULT_DB, help=f"путь к базе (по умолчанию {DEFAULT_DB})")
    parser.add_argument("--list", action="store_true", help="показать список пользователей")
    parser.add_argument(
        "--password",
        help="новый пароль без запроса (небезопасно: попадает в историю команд)",
    )
    args = parser.parse_args()

    conn = connect(args.db)
    try:
        if args.list:
            list_users(conn)
            return
        if not args.username:
            parser.error("укажите логин или используйте --list")

        password = args.password or read_new_password()
        if len(password) < MIN_PASSWORD_LENGTH:
            sys.exit(f"Ошибка: пароль должен быть не короче {MIN_PASSWORD_LENGTH} символов.")
        set_password(conn, args.username, password)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
