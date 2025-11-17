-- Seed data for testing

-- Insert a default organization
INSERT INTO organizations (id, name, address, email, phone)
VALUES 
  ('00000000-0000-0000-0000-000000000001'::uuid, 'BioTech Research Labs', '123 Science Way, Cambridge, MA', 'contact@biotechresearch.com', '+1-617-555-0100');

-- Note: Profiles will be created through auth.users signup flow
-- For now, we'll insert some test protocols and assays

-- Insert sample protocols
INSERT INTO protocols (organization_id, name, description, version, content, category, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Cell Viability Assay', 'MTT assay for determining cell viability', '1.0', 
   '## Purpose
Measure cell metabolic activity as an indicator of cell viability, proliferation and cytotoxicity.

## Materials
- MTT reagent (5 mg/mL in PBS)
- DMSO
- 96-well plates
- Spectrophotometer

## Procedure
1. Add 10 μL MTT solution to each well
2. Incubate for 2-4 hours at 37°C
3. Remove medium carefully
4. Add 100 μL DMSO to dissolve formazan crystals
5. Read absorbance at 570 nm',
   'Cell Biology', true),
   
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Western Blot Protocol', 'Standard western blot procedure for protein detection', '1.2',
   '## Purpose
Detect specific proteins in a sample using antibody-based detection.

## Materials
- Protein samples
- SDS-PAGE gels
- Transfer membrane (PVDF or nitrocellulose)
- Primary and secondary antibodies
- Blocking buffer
- Detection reagents

## Procedure
1. Prepare protein samples with loading buffer
2. Load samples on SDS-PAGE gel
3. Run electrophoresis at 100V
4. Transfer proteins to membrane
5. Block membrane with 5% milk
6. Incubate with primary antibody overnight at 4°C
7. Wash and incubate with secondary antibody
8. Detect using chemiluminescence',
   'Protein Analysis', true),
   
  ('00000000-0000-0000-0000-000000000001'::uuid, 'DNA Extraction Protocol', 'Genomic DNA extraction from cell samples', '1.0',
   '## Purpose
Extract high-quality genomic DNA from cultured cells.

## Materials
- Cell pellet
- Lysis buffer
- Proteinase K
- RNase A
- Phenol:chloroform:isoamyl alcohol
- Ethanol
- TE buffer

## Procedure
1. Resuspend cell pellet in lysis buffer
2. Add Proteinase K and incubate at 55°C
3. Add RNase A and incubate
4. Extract with phenol:chloroform
5. Precipitate DNA with ethanol
6. Wash and resuspend in TE buffer
7. Quantify using NanoDrop',
   'Molecular Biology', true);

-- Insert sample assays
INSERT INTO assays (organization_id, name, description, category, default_parameters)
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'MTT Cell Viability', 'MTT colorimetric assay for cell viability', 'Cell Biology',
   '{"sample_count": 96, "replicates": 3, "incubation_time": "2-4 hours", "wavelength": "570nm", "reference_wavelength": "650nm"}'::jsonb),
   
  ('00000000-0000-0000-0000-000000000001'::uuid, 'IC50 Determination', 'Half maximal inhibitory concentration assay', 'Pharmacology',
   '{"sample_count": 8, "concentration_range": "0.001-100 μM", "replicates": 3, "incubation_time": "48 hours"}'::jsonb),
   
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Protein Quantification', 'BCA protein assay for sample quantification', 'Protein Analysis',
   '{"sample_count": 24, "standards": 8, "replicates": 2, "incubation_time": "30 min", "wavelength": "562nm"}'::jsonb),
   
  ('00000000-0000-0000-0000-000000000001'::uuid, 'qPCR Gene Expression', 'Quantitative PCR for gene expression analysis', 'Molecular Biology',
   '{"sample_count": 24, "target_genes": 5, "housekeeping_genes": 2, "replicates": 3, "cycles": 40}'::jsonb);

-- Insert sample equipment
INSERT INTO equipment (organization_id, name, equipment_code, category, model, manufacturer, serial_number, location, status)
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'LC-MS/MS System', 'LAB-A-201', 'Analytical', 'QExactive Plus', 'ThermoFisher', 'QE12345', 'Lab A - Room 201', 'available'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Plate Reader', 'LAB-A-105', 'Analytical', 'SpectraMax M5', 'Molecular Devices', 'MD67890', 'Lab A - Room 105', 'available'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Flow Cytometer', 'LAB-B-301', 'Cell Analysis', 'FACSAria III', 'BD Biosciences', 'BD54321', 'Lab B - Room 301', 'in_use'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Thermocycler', 'LAB-A-110', 'Molecular Biology', 'T100', 'Bio-Rad', 'BR11223', 'Lab A - Room 110', 'available'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Centrifuge', 'LAB-A-102', 'General', '5810 R', 'Eppendorf', 'EP98765', 'Lab A - Room 102', 'available');
