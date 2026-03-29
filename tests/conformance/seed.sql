-- mRPC Conformance Test Seed Data
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    name TEXT,
    price REAL,
    state TEXT DEFAULT 'active'
);

INSERT INTO items (name, price, state) VALUES ('Widget', 10.5, 'active');
INSERT INTO items (name, price, state) VALUES ('Gadget', 25.0, 'active');
INSERT INTO items (name, price, state) VALUES ('Old', 5.0, 'archived');
