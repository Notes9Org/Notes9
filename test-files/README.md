# Test Files for ELN Upload Testing

This folder contains sample files in various formats for testing the file upload functionality.

## 📁 Files Available:

| File Name | Type | Size | Description |
|-----------|------|------|-------------|
| **Documents** | | | |
| `experiment-protocol.pdf` | PDF | 113 KB | Complete SOP with tables and formatting |
| `experiment-report.md` | Markdown | 1.5 KB | Experiment report with methodology |
| **Data Files** | | | |
| `sample-data.csv` | CSV | 376 B | Experimental measurements table |
| `experiment-data.json` | JSON | 1.1 KB | Structured experiment conditions |
| `analysis-results.xml` | XML | 1.1 KB | Spectrophotometry results |
| `sequencing-data.fasta` | FASTA | 897 B | Protein sequence data |
| **Images** | | | |
| `gel-electrophoresis.jpg` | JPEG | 31 KB | Gel electrophoresis bands |
| `cell-microscopy.jpg` | JPEG | 50 KB | Cell culture microscopy |
| `microscope-image.png` | PNG | 8.4 KB | Sample microscope view |
| `crystal-image.svg` | SVG | 1.3 KB | Protein crystal diagram |
| **Notes** | | | |
| `lab-notes.txt` | Text | 1.1 KB | Daily lab observations |

**Total:** 11 test files | **Total Size:** ~210 KB

---

## 🧪 Testing Scenarios:

### 1. **CSV Data Upload**
- **File:** `sample-data.csv`
- **Use Case:** Raw experimental measurements
- **Data Type:** Raw Data
- **Expected:** Table preview, easy download

### 2. **Report Upload**
- **File:** `experiment-report.md`
- **Use Case:** Experiment documentation
- **Data Type:** Analysis Results
- **Expected:** Text preview available

### 3. **Structured Data**
- **File:** `experiment-data.json`
- **Use Case:** Machine-readable experiment data
- **Data Type:** Processed Data
- **Expected:** JSON formatting visible

### 4. **Lab Notes**
- **File:** `lab-notes.txt`
- **Use Case:** Daily observations
- **Data Type:** Raw Data
- **Expected:** Plain text preview

### 5. **Analysis Results**
- **File:** `analysis-results.xml`
- **Use Case:** Instrument output
- **Data Type:** Analysis Results
- **Expected:** XML structure preserved

### 6. **Vector Image**
- **File:** `crystal-image.svg`
- **Use Case:** Crystal structure diagram
- **Data Type:** Visualization
- **Expected:** Scalable image display

### 7. **Raster Image**
- **File:** `microscope-image.png`
- **Use Case:** Microscopy photo
- **Data Type:** Visualization
- **Expected:** Image preview in browser

---

## ✅ How to Test:

1. Navigate to any experiment in the ELN
2. Go to **"Data & Files"** tab
3. Click **"Upload File"** button
4. Select one of these test files
5. Choose appropriate **Data Type**
6. Click **"Upload"**
7. Verify file appears in the table
8. Test **View**, **Download**, and **Delete** functions

---

## 🎯 Expected Behavior:

✅ All files should upload successfully (all under 10 MB limit)
✅ File icons should match file types
✅ Download should work for all files
✅ View/Preview should open files in new tab
✅ Delete should remove files with confirmation
✅ Upload progress bar should show 10% → 60% → 80% → 100%

---

## 🔒 Security Tests:

These files are safe and contain only sample scientific data. No executable code or malicious content.

**Good to test:**
- Multiple uploads in sequence
- Different data types
- Concurrent uploads (open multiple dialogs)
- Delete and re-upload same file

---

**All files created:** 2025-01-16
**Purpose:** ELN File Upload Testing

