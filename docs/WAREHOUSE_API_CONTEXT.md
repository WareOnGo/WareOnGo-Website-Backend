# Warehouse API - Complete Context & Filter Documentation

## Endpoint Overview

**GET** `/warehouses`

A comprehensive warehouse search and filtering API with pagination support, Redis caching, and advanced multi-parameter filtering capabilities.

---

## Base Information

- **Method:** GET
- **Endpoint:** `/warehouses`
- **Authentication:** None (Public)
- **Cache Duration:** 5 minutes (300 seconds)
- **Default Page Size:** 10
- **Max Recommended Page Size:** 50

---

## Query Parameters Reference

### 1. Pagination Parameters (Required)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | integer | Yes | 1 | Current page number (1-indexed) |
| `pageSize` | integer | Yes | 10 | Number of results per page |

**Example:**
```
GET /warehouses?page=1&pageSize=20
```

---

### 2. Text Search Filters (Optional)

All text filters support:
- ✅ Case-insensitive matching
- ✅ Partial string matching (substring search)
- ✅ Multiple values (OR logic within same field)
- ✅ Comma-separated format: `field=value1,value2,value3`
- ✅ Repeated parameter format: `field=value1&field=value2`

| Parameter | Type | Multi-value | Description | Example Values |
|-----------|------|-------------|-------------|----------------|
| `city` | string/array | ✅ Yes | Filter by city name(s) | `Mumbai`, `Mumbai,Delhi,Bangalore` |
| `state` | string/array | ✅ Yes | Filter by state name(s) | `Maharashtra`, `Karnataka,Delhi` |
| `warehouseType` | string/array | ✅ Yes | Filter by warehouse type(s) | `Cold`, `Cold,Ambient,Hazardous` |
| `zone` | string/array | ✅ Yes | Filter by zone(s) | `North`, `North,South,East,West` |
| `contactPerson` | string/array | ✅ Yes | Filter by contact person name(s) | `Rajesh`, `John,Kumar` |
| `compliances` | string/array | ✅ Yes | Filter by compliance standards | `FDA`, `FDA,ISO,FSSAI` |
| `address` | string | ❌ No | Filter by address (single value only) | `Andheri`, `Sector 18` |

**Single Value Examples:**
```bash
# Search for warehouses in Mumbai
GET /warehouses?city=Mumbai&page=1&pageSize=20

# Search for Cold Storage type
GET /warehouses?warehouseType=Cold&page=1&pageSize=20

# Search by address
GET /warehouses?address=Andheri&page=1&pageSize=20
```

**Multiple Value Examples:**
```bash
# Multiple cities (comma-separated)
GET /warehouses?city=Mumbai,Delhi,Bangalore&page=1&pageSize=20

# Multiple warehouse types
GET /warehouses?warehouseType=Cold,Ambient&page=1&pageSize=20

# Multiple zones
GET /warehouses?zone=North,South,East&page=1&pageSize=20

# Multiple compliances
GET /warehouses?compliances=FDA,ISO,FSSAI&page=1&pageSize=20
```

---

### 3. Numeric Range Filters (Optional)

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `minBudget` | number | Minimum rate per square foot (inclusive) | `10`, `25.5` |
| `maxBudget` | number | Maximum rate per square foot (inclusive) | `50`, `100` |
| `minClearHeight` | number | Minimum clear height in feet (inclusive) | `15`, `20` |
| `maxClearHeight` | number | Maximum clear height in feet (inclusive) | `30`, `50` |
| `minSpace` | number | Minimum total space in sqft (inclusive) - checks if warehouse has ANY space configuration >= this value | `5000`, `10000` |
| `maxSpace` | number | Maximum total space in sqft (inclusive) - checks if warehouse has ANY space configuration <= this value | `50000`, `100000` |

**Examples:**
```bash
# Budget range: 20-50 per sqft
GET /warehouses?minBudget=20&maxBudget=50&page=1&pageSize=20

# Minimum budget only (50 and above)
GET /warehouses?minBudget=50&page=1&pageSize=20

# Clear height range: 18-30 feet
GET /warehouses?minClearHeight=18&maxClearHeight=30&page=1&pageSize=20

# Minimum clear height only (25 feet and above)
GET /warehouses?minClearHeight=25&page=1&pageSize=20

# Space range: 10,000 - 50,000 sqft
GET /warehouses?minSpace=10000&maxSpace=50000&page=1&pageSize=20

# Minimum space only (at least 20,000 sqft available)
GET /warehouses?minSpace=20000&page=1&pageSize=20

# Maximum space only (up to 15,000 sqft)
GET /warehouses?maxSpace=15000&page=1&pageSize=20
```

**Important Note on Space Filters:**
- `totalSpaceSqft` is an array of available space configurations
- The filter checks if **ANY** value in the array meets the criteria
- Example: Warehouse with `totalSpaceSqft: [5000, 10000, 25000]` will match:
  - `minSpace=8000` (because 10000 >= 8000)
  - `maxSpace=30000` (because all values <= 30000)
  - `minSpace=10000&maxSpace=25000` (because 10000 and 25000 are in range)

---

### 4. Boolean Filters (Optional)

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `fireNocAvailable` | boolean | Filter by fire NOC availability | `true`, `false` |

**Examples:**
```bash
# Only warehouses with fire NOC
GET /warehouses?fireNocAvailable=true&page=1&pageSize=20

# Only warehouses without fire NOC
GET /warehouses?fireNocAvailable=false&page=1&pageSize=20

# Combined with other filters
GET /warehouses?city=Mumbai&fireNocAvailable=true&minBudget=20&page=1&pageSize=20
```

---

## Filter Logic & Behavior

### Within Same Field (Multiple Values)
Uses **OR** logic - matches if warehouse satisfies ANY of the values

**Example:**
```
?city=Mumbai,Delhi
```
Returns warehouses where: `city = "Mumbai" OR city = "Delhi"`

### Across Different Fields
Uses **AND** logic - warehouse must satisfy ALL specified filters

**Example:**
```
?city=Mumbai&warehouseType=Cold&minBudget=20
```
Returns warehouses where:
- `city = "Mumbai"` **AND**
- `warehouseType = "Cold"` **AND**
- `ratePerSqft >= 20`

### Combined Example
```
?city=Mumbai,Delhi&warehouseType=Cold,Ambient&minBudget=15&maxBudget=60
```
Returns warehouses where:
- `(city = "Mumbai" OR city = "Delhi")` **AND**
- `(warehouseType = "Cold" OR warehouseType = "Ambient")` **AND**
- `ratePerSqft >= 15 AND ratePerSqft <= 60`

---

## Response Format

### Success Response (200 OK)

```json
{
  "data": [
    {
      "id": 123,
      "address": "Plot 45, Sector 18, Andheri East",
      "city": "Mumbai",
      "state": "Maharashtra",
      "totalSpaceSqft": [5000, 10000, 15000],
      "clearHeightFt": 25,
      "compliances": "FDA, ISO 9001, FSSAI",
      "otherSpecifications": "24/7 Security, CCTV, Automated Systems",
      "ratePerSqft": 35,
      "photos": [
        "https://cdn.example.com/warehouse-123-1.jpg",
        "https://cdn.example.com/warehouse-123-2.jpg"
      ],
      "warehouseType": "Cold Storage",
      "zone": "West",
      "contactPerson": "Rajesh Kumar",
      "fireNocAvailable": true,
      "fireSafetyMeasures": "Sprinklers, Fire Extinguishers, Emergency Exits, Smoke Detectors"
    }
  ],
  "pagination": {
    "totalItems": 150,
    "totalPages": 15,
    "currentPage": 1,
    "pageSize": 10
  }
}
```

### Error Response (500)

```json
{
  "error": "An error occurred while fetching warehouses."
}
```

---

## Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Unique warehouse identifier |
| `address` | string | Full warehouse address |
| `city` | string | City name |
| `state` | string | State name |
| `totalSpaceSqft` | integer[] | Array of available space configurations in square feet |
| `clearHeightFt` | number | Clear height in feet |
| `compliances` | string | Comma-separated list of compliance standards |
| `otherSpecifications` | string | Additional warehouse specifications |
| `ratePerSqft` | number | Rate per square foot |
| `photos` | string[] | Array of photo URLs |
| `warehouseType` | string | Type of warehouse (Cold, Ambient, Hazardous, etc.) |
| `zone` | string | Geographic zone (North, South, East, West) |
| `contactPerson` | string | Contact person name |
| `fireNocAvailable` | boolean | Whether fire NOC is available |
| `fireSafetyMeasures` | string | Description of fire safety measures |

---

## Frontend Implementation Examples

### 1. Basic Fetch (Vanilla JavaScript)

```javascript
const fetchWarehouses = async (page = 1, pageSize = 20) => {
  try {
    const response = await fetch(
      `https://api.wareongo.com/warehouses?page=${page}&pageSize=${pageSize}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch warehouses');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    throw error;
  }
};

// Usage
const data = await fetchWarehouses(1, 20);
console.log(data.data); // Array of warehouses
console.log(data.pagination); // Pagination info
```

---

### 2. Single Filter Example

```javascript
// Filter by single city
const fetchWarehousesByCity = async (city) => {
  const response = await fetch(
    `https://api.wareongo.com/warehouses?city=${encodeURIComponent(city)}&page=1&pageSize=20`
  );
  return await response.json();
};

// Usage
const mumbaiWarehouses = await fetchWarehousesByCity('Mumbai');
```

---

### 3. Multiple Cities (Comma-separated)

```javascript
const fetchWarehousesByMultipleCities = async (cities) => {
  // cities = ['Mumbai', 'Delhi', 'Bangalore']
  const cityParam = cities.map(c => encodeURIComponent(c)).join(',');
  
  const response = await fetch(
    `https://api.wareongo.com/warehouses?city=${cityParam}&page=1&pageSize=20`
  );
  return await response.json();
};

// Usage
const data = await fetchWarehousesByMultipleCities(['Mumbai', 'Delhi', 'Bangalore']);
```

---

### 4. Budget Range Filter

```javascript
const fetchWarehousesByBudget = async (minBudget, maxBudget) => {
  const params = new URLSearchParams({
    minBudget: minBudget.toString(),
    maxBudget: maxBudget.toString(),
    page: '1',
    pageSize: '20'
  });
  
  const response = await fetch(
    `https://api.wareongo.com/warehouses?${params}`
  );
  return await response.json();
};

// Usage
const affordableWarehouses = await fetchWarehousesByBudget(20, 50);
```

---

### 5. Advanced Filter Builder (Recommended)

```javascript
const buildWarehouseQuery = (filters) => {
  const params = new URLSearchParams();
  
  // Pagination (required)
  params.append('page', filters.page || 1);
  params.append('pageSize', filters.pageSize || 20);
  
  // Multi-value text filters
  if (filters.cities && filters.cities.length > 0) {
    params.append('city', filters.cities.join(','));
  }
  
  if (filters.states && filters.states.length > 0) {
    params.append('state', filters.states.join(','));
  }
  
  if (filters.warehouseTypes && filters.warehouseTypes.length > 0) {
    params.append('warehouseType', filters.warehouseTypes.join(','));
  }
  
  if (filters.zones && filters.zones.length > 0) {
    params.append('zone', filters.zones.join(','));
  }
  
  if (filters.compliances && filters.compliances.length > 0) {
    params.append('compliances', filters.compliances.join(','));
  }
  
  // Single value text filters
  if (filters.address) {
    params.append('address', filters.address);
  }
  
  if (filters.contactPerson) {
    params.append('contactPerson', filters.contactPerson);
  }
  
  // Numeric range filters
  if (filters.minBudget) {
    params.append('minBudget', filters.minBudget);
  }
  
  if (filters.maxBudget) {
    params.append('maxBudget', filters.maxBudget);
  }
  
  if (filters.minClearHeight) {
    params.append('minClearHeight', filters.minClearHeight);
  }
  
  if (filters.maxClearHeight) {
    params.append('maxClearHeight', filters.maxClearHeight);
  }
  
  // Space filters
  if (filters.minSpace) {
    params.append('minSpace', filters.minSpace);
  }
  
  if (filters.maxSpace) {
    params.append('maxSpace', filters.maxSpace);
  }
  
  // Boolean filters
  if (filters.fireNocAvailable !== undefined) {
    params.append('fireNocAvailable', filters.fireNocAvailable);
  }
  
  return params.toString();
};

const fetchWarehouses = async (filters) => {
  const queryString = buildWarehouseQuery(filters);
  const response = await fetch(
    `https://api.wareongo.com/warehouses?${queryString}`
  );
  return await response.json();
};

// Usage Examples:

// Example 1: Multiple cities + warehouse type
const result1 = await fetchWarehouses({
  cities: ['Mumbai', 'Delhi', 'Bangalore'],
  warehouseTypes: ['Cold', 'Ambient'],
  page: 1,
  pageSize: 20
});

// Example 2: Budget range + clear height + zones
const result2 = await fetchWarehouses({
  zones: ['North', 'West'],
  minBudget: 25,
  maxBudget: 75,
  minClearHeight: 20,
  page: 1,
  pageSize: 30
});

// Example 3: Full filter set
const result3 = await fetchWarehouses({
  cities: ['Mumbai', 'Pune'],
  states: ['Maharashtra'],
  warehouseTypes: ['Cold'],
  zones: ['West'],
  compliances: ['FDA', 'FSSAI'],
  minBudget: 30,
  maxBudget: 60,
  minClearHeight: 18,
  maxClearHeight: 35,
  page: 2,
  pageSize: 25
});
```

---

### 6. React Hook Implementation

```javascript
import { useState, useEffect } from 'react';

const useWarehouses = (filters) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const params = new URLSearchParams();
        params.append('page', filters.page || 1);
        params.append('pageSize', filters.pageSize || 20);
        
        // Add all filters
        if (filters.cities?.length > 0) {
          params.append('city', filters.cities.join(','));
        }
        if (filters.warehouseTypes?.length > 0) {
          params.append('warehouseType', filters.warehouseTypes.join(','));
        }
        if (filters.minBudget) {
          params.append('minBudget', filters.minBudget);
        }
        if (filters.maxBudget) {
          params.append('maxBudget', filters.maxBudget);
        }
        // ... add other filters

        const response = await fetch(
          `https://api.wareongo.com/warehouses?${params}`
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch warehouses');
        }
        
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [JSON.stringify(filters)]); // Re-fetch when filters change

  return { data, loading, error };
};

// Usage in component
function WarehouseList() {
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 20,
    cities: [],
    warehouseTypes: [],
    minBudget: null,
    maxBudget: null
  });

  const { data, loading, error } = useWarehouses(filters);

  const handleCityChange = (selectedCities) => {
    setFilters(prev => ({ ...prev, cities: selectedCities, page: 1 }));
  };

  const handleBudgetChange = (min, max) => {
    setFilters(prev => ({ ...prev, minBudget: min, maxBudget: max, page: 1 }));
  };

  if (loading) return <div>Loading warehouses...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!data) return null;

  return (
    <div>
      {/* Filter controls */}
      <FilterPanel 
        onCityChange={handleCityChange}
        onBudgetChange={handleBudgetChange}
      />
      
      {/* Results */}
      <div className="warehouse-grid">
        {data.data.map(warehouse => (
          <WarehouseCard key={warehouse.id} warehouse={warehouse} />
        ))}
      </div>
      
      {/* Pagination */}
      <Pagination
        currentPage={data.pagination.currentPage}
        totalPages={data.pagination.totalPages}
        onPageChange={(page) => setFilters(prev => ({ ...prev, page }))}
      />
    </div>
  );
}
```

---

### 7. TypeScript Interface

```typescript
// Filter types
interface WarehouseFilters {
  page: number;
  pageSize: number;
  cities?: string[];
  states?: string[];
  address?: string;
  warehouseTypes?: string[];
  zones?: string[];
  contactPerson?: string;
  compliances?: string[];
  minBudget?: number;
  maxBudget?: number;
  minClearHeight?: number;
  maxClearHeight?: number;
  minSpace?: number;
  maxSpace?: number;
  fireNocAvailable?: boolean;
}

// Response types
interface Warehouse {
  id: number;
  address: string;
  city: string;
  state: string;
  totalSpaceSqft: number[];
  clearHeightFt: number;
  compliances: string;
  otherSpecifications: string;
  ratePerSqft: number;
  photos: string[];
  warehouseType: string;
  zone: string;
  contactPerson: string;
  fireNocAvailable: boolean;
  fireSafetyMeasures: string;
}

interface PaginationInfo {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

interface WarehouseResponse {
  data: Warehouse[];
  pagination: PaginationInfo;
}

// API function
const fetchWarehouses = async (
  filters: WarehouseFilters
): Promise<WarehouseResponse> => {
  const params = new URLSearchParams();
  params.append('page', filters.page.toString());
  params.append('pageSize', filters.pageSize.toString());
  
  if (filters.cities?.length) {
    params.append('city', filters.cities.join(','));
  }
  // ... add other filters
  
  const response = await fetch(
    `https://api.wareongo.com/warehouses?${params}`
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch warehouses');
  }
  
  return await response.json();
};
```

---

## Real-World Use Case Examples

### Use Case 1: Search by Multiple Cities
**Scenario:** User wants to see warehouses in Mumbai, Delhi, and Bangalore

```javascript
const filters = {
  cities: ['Mumbai', 'Delhi', 'Bangalore'],
  page: 1,
  pageSize: 20
};

const data = await fetchWarehouses(filters);
```

**Generated URL:**
```
GET /warehouses?city=Mumbai,Delhi,Bangalore&page=1&pageSize=20
```

---

### Use Case 2: Budget-Conscious Cold Storage Search
**Scenario:** User needs cold storage warehouses with budget between ₹20-50 per sqft

```javascript
const filters = {
  warehouseTypes: ['Cold'],
  minBudget: 20,
  maxBudget: 50,
  page: 1,
  pageSize: 20
};

const data = await fetchWarehouses(filters);
```

**Generated URL:**
```
GET /warehouses?warehouseType=Cold&minBudget=20&maxBudget=50&page=1&pageSize=20
```

---

### Use Case 3: FDA-Compliant Warehouses in Western Zone
**Scenario:** Pharmaceutical company needs FDA-compliant warehouses in western region

```javascript
const filters = {
  zones: ['West'],
  compliances: ['FDA', 'ISO'],
  minClearHeight: 20,
  page: 1,
  pageSize: 15
};

const data = await fetchWarehouses(filters);
```

**Generated URL:**
```
GET /warehouses?zone=West&compliances=FDA,ISO&minClearHeight=20&page=1&pageSize=15
```

---

### Use Case 4: Multi-State, Multi-Type Search
**Scenario:** Logistics company expanding operations across multiple states

```javascript
const filters = {
  states: ['Maharashtra', 'Karnataka', 'Gujarat'],
  warehouseTypes: ['Ambient', 'Cold'],
  minBudget: 25,
  maxBudget: 75,
  minClearHeight: 18,
  page: 1,
  pageSize: 30
};

const data = await fetchWarehouses(filters);
```

**Generated URL:**
```
GET /warehouses?state=Maharashtra,Karnataka,Gujarat&warehouseType=Ambient,Cold&minBudget=25&maxBudget=75&minClearHeight=18&page=1&pageSize=30
```

---

### Use Case 5: Fire NOC Compliant Warehouses
**Scenario:** Company requires warehouses with valid fire NOC certificate

```javascript
const filters = {
  cities: ['Mumbai', 'Pune'],
  fireNocAvailable: true,
  minClearHeight: 20,
  page: 1,
  pageSize: 20
};

const data = await fetchWarehouses(filters);
```

**Generated URL:**
```
GET /warehouses?city=Mumbai,Pune&fireNocAvailable=true&minClearHeight=20&page=1&pageSize=20
```

---

### Use Case 6: Large Space Requirements
**Scenario:** E-commerce company needs warehouses with at least 50,000 sqft available space

```javascript
const filters = {
  minSpace: 50000,
  zones: ['North', 'West'],
  minBudget: 15,
  maxBudget: 40,
  page: 1,
  pageSize: 20
};

const data = await fetchWarehouses(filters);
```

**Generated URL:**
```
GET /warehouses?minSpace=50000&zone=North,West&minBudget=15&maxBudget=40&page=1&pageSize=20
```

---

### Use Case 7: Small to Medium Space Requirements
**Scenario:** Startup looking for affordable smaller warehouses (5,000 - 15,000 sqft)

```javascript
const filters = {
  minSpace: 5000,
  maxSpace: 15000,
  cities: ['Bangalore', 'Hyderabad'],
  maxBudget: 30,
  page: 1,
  pageSize: 15
};

const data = await fetchWarehouses(filters);
```

**Generated URL:**
```
GET /warehouses?minSpace=5000&maxSpace=15000&city=Bangalore,Hyderabad&maxBudget=30&page=1&pageSize=15
```

---

## Performance & Caching

### Cache Behavior
- Results are cached in **Redis** for **5 minutes (300 seconds)**
- Cache key includes **all filter parameters**
- Different filter combinations are cached separately
- Pagination is part of cache key (each page cached separately)

### Cache Benefits
- ⚡ Faster response times for repeated queries
- 🔄 Reduces database load
- 📊 Better performance during peak traffic

### Cache Considerations
- Data may be up to 5 minutes old
- New warehouse additions may not appear immediately
- Use `/cache/warehouses` DELETE endpoint to force cache refresh if needed

### Space Filter Implementation
- Space filters (`minSpace`, `maxSpace`) are applied **post-query** (in-memory filtering)
- This is because PostgreSQL array range queries are complex
- The API fetches extra records to ensure sufficient results after filtering
- Performance may be slightly slower with space filters compared to other filters
- Consider combining space filters with other filters (city, zone) to improve performance

---

## Best Practices

### 1. Input Debouncing
For search inputs, implement debouncing to avoid excessive API calls:

```javascript
import { useState, useEffect } from 'react';

function SearchInput({ onSearch }) {
  const [input, setInput] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (input) {
        onSearch(input);
      }
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(timer);
  }, [input, onSearch]);

  return (
    <input
      value={input}
      onChange={(e) => setInput(e.target.value)}
      placeholder="Search by city..."
    />
  );
}
```

---

### 2. URL Encoding
Always encode parameters, especially those with special characters:

```javascript
const city = 'New Delhi'; // Has space
const encoded = encodeURIComponent(city);
// Result: 'New%20Delhi'

const url = `https://api.wareongo.com/warehouses?city=${encoded}&page=1&pageSize=20`;
```

---

### 3. Error Handling
Implement proper error handling for network failures:

```javascript
const fetchWarehouses = async (filters) => {
  try {
    const response = await fetch(buildURL(filters));
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    if (error.name === 'TypeError') {
      // Network error
      throw new Error('Network error. Please check your connection.');
    }
    throw error;
  }
};
```

---

### 4. Loading States
Show loading indicators during API calls:

```javascript
function WarehouseList() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const loadWarehouses = async (filters) => {
    setLoading(true);
    try {
      const result = await fetchWarehouses(filters);
      setData(result);
    } finally {
      setLoading(false);
    }
  };

  return loading ? <Spinner /> : <Results data={data} />;
}
```

---

### 5. Pagination Best Practices
- Show page numbers and total pages
- Disable "Previous" on page 1
- Disable "Next" on last page
- Reset to page 1 when filters change

```javascript
const handleFilterChange = (newFilters) => {
  setFilters({
    ...newFilters,
    page: 1 // Always reset to page 1 on filter change
  });
};
```

---

## Common Pitfalls & Solutions

### ❌ Pitfall 1: Not Encoding Special Characters
```javascript
// Wrong
const url = `?city=New Delhi`; // Space not encoded

// Correct
const url = `?city=${encodeURIComponent('New Delhi')}`;
```

---

### ❌ Pitfall 2: Forgetting Pagination Parameters
```javascript
// Wrong - Missing required pagination
fetch('/warehouses?city=Mumbai');

// Correct
fetch('/warehouses?city=Mumbai&page=1&pageSize=20');
```

---

### ❌ Pitfall 3: Not Handling Empty Arrays
```javascript
// Wrong - Sends "city=" even when empty
if (cities) params.append('city', cities.join(','));

// Correct - Only add if array has items
if (cities?.length > 0) params.append('city', cities.join(','));
```

---

### ❌ Pitfall 4: Ignoring Cache
```javascript
// If you need fresh data, clear cache first
await fetch('/cache/warehouses', { method: 'DELETE' });
const data = await fetchWarehouses(filters); // Will fetch from DB
```

---

## Testing Examples

### cURL Commands for Testing

```bash
# 1. Basic pagination
curl "http://localhost:3000/warehouses?page=1&pageSize=20"

# 2. Single city
curl "http://localhost:3000/warehouses?city=Mumbai&page=1&pageSize=10"

# 3. Multiple cities
curl "http://localhost:3000/warehouses?city=Mumbai,Delhi,Bangalore&page=1&pageSize=20"

# 4. Budget range
curl "http://localhost:3000/warehouses?minBudget=20&maxBudget=50&page=1&pageSize=20"

# 5. Combined filters
curl "http://localhost:3000/warehouses?city=Mumbai&warehouseType=Cold&minBudget=15&maxBudget=60&page=1&pageSize=20"

# 6. Fire NOC filter
curl "http://localhost:3000/warehouses?fireNocAvailable=true&page=1&pageSize=20"

# 7. Space range filter (10,000 - 50,000 sqft)
curl "http://localhost:3000/warehouses?minSpace=10000&maxSpace=50000&page=1&pageSize=20"

# 8. Minimum space only (at least 25,000 sqft)
curl "http://localhost:3000/warehouses?minSpace=25000&page=1&pageSize=20"

# 9. Combined filters with space
curl "http://localhost:3000/warehouses?city=Mumbai&minSpace=15000&maxSpace=40000&minBudget=20&maxBudget=50&page=1&pageSize=20"

# 10. Clear cache
curl -X DELETE "http://localhost:3000/cache/warehouses"
```

---

## Quick Reference Table

| Filter | Single Value | Multiple Values | Partial Match | Range |
|--------|-------------|-----------------|---------------|-------|
| `city` | ✅ | ✅ | ✅ | ❌ |
| `state` | ✅ | ✅ | ✅ | ❌ |
| `address` | ✅ | ❌ | ✅ | ❌ |
| `warehouseType` | ✅ | ✅ | ✅ | ❌ |
| `zone` | ✅ | ✅ | ✅ | ❌ |
| `contactPerson` | ✅ | ✅ | ✅ | ❌ |
| `compliances` | ✅ | ✅ | ✅ | ❌ |
| `minBudget` | ✅ | ❌ | ❌ | ✅ |
| `maxBudget` | ✅ | ❌ | ❌ | ✅ |
| `minClearHeight` | ✅ | ❌ | ❌ | ✅ |
| `maxClearHeight` | ✅ | ❌ | ❌ | ✅ |
| `minSpace` | ✅ | ❌ | ❌ | ✅ |
| `maxSpace` | ✅ | ❌ | ❌ | ✅ |
| `fireNocAvailable` | ✅ | ❌ | ❌ | ❌ |

---

## Support & Contact

For questions, issues, or feature requests:
- Backend Team: backend@wareongo.com
- API Documentation: https://docs.wareongo.com
- Issue Tracker: https://github.com/wareongo/api/issues

---

**Last Updated:** October 15, 2025  
**API Version:** 1.0  
**Maintained By:** WareOnGo Backend Team
