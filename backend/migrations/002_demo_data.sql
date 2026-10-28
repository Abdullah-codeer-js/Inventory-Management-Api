INSERT INTO suppliers (name, contact_person, email, phone, address)
SELECT seed.name, seed.contact_person, seed.email, seed.phone, seed.address
FROM (
  VALUES
    ('Northstar Office Supply', 'Maya Chen', 'maya@northstar.example.com', '555-0101', '100 Market Street'),
    ('Circuit Haven Components', 'Evan Brooks', 'evan@circuithaven.example.com', '555-0102', '24 Innovation Drive'),
    ('Summit Safety & Packaging', 'Ava Patel', 'ava@summitsafety.example.com', '555-0103', '8 Industrial Way'),
    ('Greenline Workspace', 'Noah Kim', 'noah@greenline.example.com', '555-0104', '71 Design Avenue'),
    ('Vertex Tools & Hardware', 'Lena Ortiz', 'lena@vertextools.example.com', '555-0105', '310 Foundry Road')
) AS seed(name, contact_person, email, phone, address)
WHERE NOT EXISTS (
  SELECT 1 FROM suppliers existing WHERE LOWER(existing.email) = LOWER(seed.email)
);

INSERT INTO categories (name, description)
VALUES
  ('Office Supplies', 'Everyday paper, writing, and printer supplies.'),
  ('Electronics', 'Computer accessories and small electronic equipment.'),
  ('Tools & Hardware', 'Tools and hardware for facilities and repairs.'),
  ('Safety & Packaging', 'Protective equipment and shipping materials.'),
  ('Furniture', 'Furniture and ergonomic workspace equipment.')
ON CONFLICT (name) DO NOTHING;

WITH seed(name, sku, description, category_name, supplier_email, quantity, unit_price, low_stock_threshold) AS (
  VALUES
    ('Recycled Copy Paper, 5 Reams', 'OFF-PAPER-001', 'Letter-size recycled multipurpose paper.', 'Office Supplies', 'maya@northstar.example.com', 48, 27.50, 12),
    ('Black Laser Toner Cartridge', 'OFF-TONER-002', 'High-yield black toner cartridge.', 'Office Supplies', 'maya@northstar.example.com', 16, 64.99, 5),
    ('Wireless Keyboard and Mouse Set', 'ELEC-INPUT-001', 'Compact wireless keyboard and mouse combo.', 'Electronics', 'evan@circuithaven.example.com', 22, 39.95, 6),
    ('USB-C 8-in-1 Hub', 'ELEC-HUB-002', 'USB-C hub with HDMI, USB-A, and card reader ports.', 'Electronics', 'evan@circuithaven.example.com', 9, 54.00, 4),
    ('Adjustable LED Desk Lamp', 'ELEC-LAMP-003', 'Dimmable LED task lamp with adjustable arm.', 'Electronics', 'evan@circuithaven.example.com', 14, 32.50, 5),
    ('Cordless Drill Driver Kit', 'TOOL-DRILL-001', '18V drill driver with battery and charger.', 'Tools & Hardware', 'lena@vertextools.example.com', 7, 129.00, 3),
    ('Protective Safety Glasses', 'SAFE-GLASS-001', 'Clear anti-scratch safety glasses.', 'Safety & Packaging', 'ava@summitsafety.example.com', 60, 8.75, 15),
    ('Double-Wall Shipping Boxes, 10 Pack', 'PACK-BOX-002', 'Medium double-wall corrugated shipping boxes.', 'Safety & Packaging', 'ava@summitsafety.example.com', 25, 18.90, 8),
    ('Heavy-Duty Packing Tape, 6 Rolls', 'PACK-TAPE-003', 'Clear, high-adhesion packing tape.', 'Safety & Packaging', 'ava@summitsafety.example.com', 32, 12.40, 10),
    ('Ergonomic Task Chair', 'FURN-CHAIR-001', 'Adjustable task chair with lumbar support.', 'Furniture', 'noah@greenline.example.com', 5, 219.00, 2)
),
inserted AS (
  INSERT INTO products (
    name, sku, description, category_id, supplier_id, quantity, unit_price, low_stock_threshold
  )
  SELECT seed.name, seed.sku, seed.description, categories.id, suppliers.id,
    seed.quantity, seed.unit_price, seed.low_stock_threshold
  FROM seed
  JOIN categories ON categories.name = seed.category_name
  JOIN suppliers ON LOWER(suppliers.email) = LOWER(seed.supplier_email)
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, quantity
)
INSERT INTO inventory_history (
  product_id, movement_type, quantity_change, previous_quantity, new_quantity, reason
)
SELECT id, 'stock_in', quantity, 0, quantity, 'Initial demo stock'
FROM inserted
WHERE quantity > 0;
