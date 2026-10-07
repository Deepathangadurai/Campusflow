import sqlite3

con = sqlite3.connect('data/campusflow.db')
cur = con.cursor()
cur.execute("SELECT c.id, c.page_number, c.text FROM document_chunks c JOIN documents d ON d.id=c.document_id WHERE d.file_name LIKE '%time table%'")
for r in cur.fetchall():
    print(f"=== Chunk {r[0]} (page {r[1]}) ===")
    print(r[2])
    print()
