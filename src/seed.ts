export {};

const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/homenest';
const DB_NAME = 'homenest';

// ============================================================
// SEED DATA
// ============================================================

const users = [
  {
    name: 'Admin',
    email: 'admin@homenest.com',
    password: 'admin123',
    role: 'admin',
    avatar: '',
    phone: '+8801700-000000',
  },
  {
    name: 'Rahim Ahmed',
    email: 'demo@homenest.com',
    password: 'password123',
    role: 'agent',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
    phone: '+8801711-234567',
  },
  {
    name: 'John Doe',
    email: 'john@example.com',
    password: 'password123',
    role: 'user',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
    phone: '+8801812-345678',
  },
];

const properties = [
  // ---- DHAKA PROPERTIES ----
  {
    title: 'Modern 3-Bed Apartment in Gulshan',
    shortDescription: 'Luxurious 3-bedroom apartment with panoramic city views in the heart of Gulshan.',
    fullDescription: 'Experience luxury living in this stunning 3-bedroom apartment located in the prestigious Gulshan area. Featuring floor-to-ceiling windows, modern finishes, and breathtaking views of the city skyline. The open-concept living and dining area flows seamlessly into a state-of-the-art kitchen with granite countertops and stainless steel appliances. Master suite includes a walk-in closet and spa-inspired bathroom. Two additional bedrooms share a well-appointed bathroom. Building amenities include 24/7 security, rooftop garden, gym, and covered parking.',
    propertyType: 'apartment',
    price: 85000,
    priceType: 'monthly',
    location: { city: 'Dhaka', area: 'Gulshan' },
    bedrooms: 3,
    bathrooms: 2,
    area: 2200,
    amenities: ['AC', 'Parking', 'Security', 'Gym', 'Rooftop Garden', 'Elevator', 'Generator', 'CCTV'],
    images: [
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
      'https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=800',
      'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800',
    ],
    isFeatured: true,
  },
  {
    title: 'Luxury Villa in Dhanmondi',
    shortDescription: 'Spacious 5-bedroom villa with private garden and swimming pool.',
    fullDescription: 'This magnificent villa in Dhanmondi offers the perfect blend of luxury and comfort. With 5 spacious bedrooms, 4 bathrooms, a private swimming pool, and a beautifully landscaped garden, this property is ideal for families who value space and privacy. The villa features a modern open-plan kitchen, formal dining room, and a large living area with high ceilings. Additional features include a maid\'s quarter, driver\'s room, and two-car garage. Located in one of Dhaka\'s most sought-after neighborhoods.',
    propertyType: 'villa',
    price: 50000000,
    priceType: 'total',
    location: { city: 'Dhaka', area: 'Dhanmondi' },
    bedrooms: 5,
    bathrooms: 4,
    area: 4500,
    amenities: ['Swimming Pool', 'Garden', 'Parking', 'Security', 'AC', 'Generator', 'Gym', 'CCTV', 'Maid Quarter'],
    images: [
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800',
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
    ],
    isFeatured: true,
  },
  {
    title: 'Cozy Studio Apartment in Banani',
    shortDescription: 'Fully furnished studio apartment perfect for young professionals.',
    fullDescription: 'This beautifully designed studio apartment in Banani is perfect for singles or couples. Fully furnished with modern decor, the space features a comfortable sleeping area, compact kitchen with all appliances, and a clean bathroom. Large windows provide plenty of natural light. The building offers 24/7 security, high-speed elevator, and a rooftop lounge. Located near popular restaurants, cafes, and shopping centers.',
    propertyType: 'apartment',
    price: 25000,
    priceType: 'monthly',
    location: { city: 'Dhaka', area: 'Banani' },
    bedrooms: 1,
    bathrooms: 1,
    area: 650,
    amenities: ['Furnished', 'AC', 'Elevator', 'Security', 'Wi-Fi', 'Laundry'],
    images: [
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
      'https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=800',
      'https://images.unsplash.com/photo-1560448204-61dc36dc98c8?w=800',
    ],
    isFeatured: false,
  },
  {
    title: 'Premium Commercial Space in Motijheel',
    shortDescription: 'Prime office space in Dhaka\'s central business district.',
    fullDescription: 'Located in the heart of Motijheel, this premium commercial space offers an excellent opportunity for businesses looking for a prestigious address. The open-plan layout can accommodate up to 50 workstations, with separate meeting rooms, a reception area, and executive offices. Features include central air conditioning, fiber-optic internet, fire safety systems, and 24/7 access. Ample parking space available in the building basement.',
    propertyType: 'commercial',
    price: 150000,
    priceType: 'monthly',
    location: { city: 'Dhaka', area: 'Motijheel' },
    area: 3500,
    amenities: ['AC', 'Parking', 'Elevator', 'Security', 'Fire Safety', 'Fiber Internet', 'Conference Room'],
    images: [
      'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
      'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800',
      'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800',
    ],
    isFeatured: false,
  },
  {
    title: 'Elegant 2-Bed Apartment in Uttara',
    shortDescription: 'Well-designed 2-bedroom apartment in a peaceful Uttara neighborhood.',
    fullDescription: 'This elegant 2-bedroom apartment in Uttara offers a perfect living space for small families. Located in Sector 7, the apartment features a modern kitchen, spacious bedrooms with built-in wardrobes, and two bathrooms with quality fixtures. The living room opens to a balcony with pleasant views. The building includes a community hall, children\'s play area, and grocery shops on the ground floor. Easy access to the airport and main highways.',
    propertyType: 'apartment',
    price: 35000,
    priceType: 'monthly',
    location: { city: 'Dhaka', area: 'Uttara' },
    bedrooms: 2,
    bathrooms: 2,
    area: 1400,
    amenities: ['AC', 'Parking', 'Security', 'Elevator', 'Generator', 'Playground', 'Balcony'],
    images: [
      'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=800',
      'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=800',
      'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800',
    ],
    isFeatured: false,
  },
  {
    title: 'Residential Plot in Purbachal',
    shortDescription: 'Prime residential plot in the planned Purbachal New Town.',
    fullDescription: 'Invest in your future with this prime residential plot located in Purbachal New Town, Dhaka\'s largest planned residential area. The plot measures 5 katha and is situated in a well-developed sector with wide roads, underground drainage, and electricity connections. The area is rapidly developing with schools, hospitals, and shopping centers nearby. An excellent investment opportunity with high appreciation potential.',
    propertyType: 'land',
    price: 25000000,
    priceType: 'total',
    location: { city: 'Dhaka', area: 'Purbachal' },
    area: 3600,
    amenities: ['Road Access', 'Electricity', 'Drainage', 'Gated Community'],
    images: [
      'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800',
      'https://images.unsplash.com/photo-1628624747186-a941c476b7ef?w=800',
      'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=800',
    ],
    isFeatured: false,
  },

  // ---- CHITTAGONG PROPERTIES ----
  {
    title: 'Sea-View Apartment in Chattogram',
    shortDescription: 'Stunning apartment with breathtaking Bay of Bengal views.',
    fullDescription: 'Wake up to the sound of waves in this beautiful sea-view apartment in Chattogram. Located on the 12th floor of a premium building, this 3-bedroom apartment offers panoramic views of the Bay of Bengal. Features include a modern kitchen, spacious bedrooms with en-suite bathrooms, and a large living area that opens to a wraparound balcony. The building has a rooftop infinity pool, fitness center, and 24/7 concierge service. Just minutes from GEC Circle and major shopping areas.',
    propertyType: 'apartment',
    price: 55000,
    priceType: 'monthly',
    location: { city: 'Chittagong', area: 'GEC Circle' },
    bedrooms: 3,
    bathrooms: 3,
    area: 2000,
    amenities: ['Sea View', 'AC', 'Swimming Pool', 'Gym', 'Security', 'Elevator', 'Concierge', 'CCTV'],
    images: [
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800',
      'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
      'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800',
    ],
    isFeatured: true,
  },
  {
    title: 'Commercial Building in Agrabad',
    shortDescription: 'Multi-story commercial building in Chittagong\'s business hub.',
    fullDescription: 'This well-located commercial building in Agrabad, Chittagong\'s primary business district, offers multiple floors of office and retail space. The building features a modern facade, central air conditioning, high-speed elevators, and ample parking. Currently configured with open-plan office floors and ground-floor retail spaces. Ideal for corporate headquarters, banks, or retail businesses looking for high foot traffic.',
    propertyType: 'commercial',
    price: 80000000,
    priceType: 'total',
    location: { city: 'Chittagong', area: 'Agrabad' },
    area: 8000,
    amenities: ['AC', 'Parking', 'Elevator', 'Security', 'Fire Safety', 'Fiber Internet', 'Storage'],
    images: [
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800',
      'https://images.unsplash.com/photo-1554469384-e58fac16e23a?w=800',
      'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800',
    ],
    isFeatured: false,
  },
  {
    title: 'Family Home in CDA Avenue',
    shortDescription: 'Beautiful family home with garden in a prime Chittagong location.',
    fullDescription: 'This charming family home on CDA Avenue offers a perfect blend of traditional and modern architecture. With 4 bedrooms, 3 bathrooms, a spacious living and dining area, and a well-maintained garden, this property is ideal for families. The kitchen comes fully equipped with modern appliances, and there\'s a separate dining room for formal occasions. Located in a quiet, tree-lined neighborhood with easy access to schools and hospitals.',
    propertyType: 'villa',
    price: 35000000,
    priceType: 'total',
    location: { city: 'Chittagong', area: 'CDA Avenue' },
    bedrooms: 4,
    bathrooms: 3,
    area: 3200,
    amenities: ['Garden', 'Parking', 'Security', 'AC', 'Generator', 'Water Supply'],
    images: [
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
      'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800',
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800',
    ],
    isFeatured: false,
  },
  {
    title: 'Affordable Apartment in Nasirabad',
    shortDescription: 'Budget-friendly 2-bedroom apartment for small families.',
    fullDescription: 'Looking for an affordable yet comfortable living space in Chittagong? This 2-bedroom apartment in Nasirabad offers great value. The apartment features two well-sized bedrooms, a functional kitchen, a living room, and one bathroom. The building has basic amenities including security, water supply, and backup electricity. Located in a well-connected area with schools, markets, and public transport within walking distance.',
    propertyType: 'apartment',
    price: 18000,
    priceType: 'monthly',
    location: { city: 'Chittagong', area: 'Nasirabad' },
    bedrooms: 2,
    bathrooms: 1,
    area: 1000,
    amenities: ['Security', 'Water Supply', 'Generator', 'Parking'],
    images: [
      'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=800',
      'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=800',
      'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800',
    ],
    isFeatured: false,
  },

  // ---- SYLHET PROPERTIES ----
  {
    title: 'Hill-View Villa in Sylhet',
    shortDescription: 'Magnificent villa with stunning hill and tea garden views.',
    fullDescription: 'Nestled in the rolling hills of Sylhet, this magnificent villa offers unparalleled views of the surrounding tea gardens and hills. The property features 4 spacious bedrooms, each with an attached bathroom, a grand living room with fireplace, a modern kitchen, and a wraparound veranda perfect for enjoying the cool breeze. The 1-bigha landscaped garden includes a small pond and seating areas. Ideal as a vacation home or permanent residence for those seeking tranquility.',
    propertyType: 'villa',
    price: 65000000,
    priceType: 'total',
    location: { city: 'Sylhet', area: 'Zindabazar' },
    bedrooms: 4,
    bathrooms: 4,
    area: 3800,
    amenities: ['Hill View', 'Garden', 'Pond', 'Parking', 'Security', 'Fireplace', 'Veranda'],
    images: [
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
      'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800',
    ],
    isFeatured: true,
  },
  {
    title: 'Modern Apartment in Sylhet City',
    shortDescription: 'Contemporary 3-bedroom apartment in the heart of Sylhet.',
    fullDescription: 'This contemporary 3-bedroom apartment combines modern design with comfortable living in the heart of Sylhet city. Located near Zindabazar, the apartment features an open-plan living and dining area, a modular kitchen with branded appliances, and three well-appointed bedrooms. The master bedroom includes an en-suite bathroom and walk-in closet. Building amenities include parking, security, and a rooftop terrace with city views.',
    propertyType: 'apartment',
    price: 30000,
    priceType: 'monthly',
    location: { city: 'Sylhet', area: 'Zindabazar' },
    bedrooms: 3,
    bathrooms: 2,
    area: 1600,
    amenities: ['AC', 'Parking', 'Security', 'Elevator', 'Generator', 'Rooftop Terrace'],
    images: [
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
      'https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=800',
      'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800',
    ],
    isFeatured: false,
  },
  {
    title: 'Tea Garden Land in Sreemangal',
    shortDescription: 'Picturesque land parcel near famous tea gardens.',
    fullDescription: 'Own a piece of paradise with this land parcel near the famous tea gardens of Sreemangal. The 10-katha plot is located on a paved road with electricity and water connections. Surrounded by lush green tea estates, this land is perfect for building a dream vacation home, a boutique resort, or simply as an investment. The area is known for its natural beauty, with Lawachara National Park and Madhabkunda waterfall nearby.',
    propertyType: 'land',
    price: 15000000,
    priceType: 'total',
    location: { city: 'Sylhet', area: 'Sreemangal' },
    area: 7200,
    amenities: ['Road Access', 'Electricity', 'Water', 'Scenic View'],
    images: [
      'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800',
      'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=800',
      'https://images.unsplash.com/photo-1628624747186-a941c476b7ef?w=800',
    ],
    isFeatured: false,
  },
  {
    title: 'Resort-Style Apartment in Sylhet',
    shortDescription: 'Premium apartment with resort-style amenities.',
    fullDescription: 'Live the resort lifestyle every day in this premium apartment complex in Sylhet. This 2-bedroom unit features luxury finishes, a modern kitchen, and a private balcony overlooking the complex\'s swimming pool and gardens. Residents enjoy access to a clubhouse, swimming pool, gym, and beautifully landscaped grounds. Located in a quiet area yet close to the city center, schools, and hospitals.',
    propertyType: 'apartment',
    price: 40000,
    priceType: 'monthly',
    location: { city: 'Sylhet', area: 'Baluchar' },
    bedrooms: 2,
    bathrooms: 2,
    area: 1300,
    amenities: ['Swimming Pool', 'Gym', 'Clubhouse', 'Garden', 'Parking', 'Security', 'AC', 'Generator'],
    images: [
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800',
      'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800',
      'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=800',
    ],
    isFeatured: false,
  },

  // ---- RAJSHAHI PROPERTIES ----
  {
    title: 'Spacious Family Home in Rajshahi',
    shortDescription: 'Traditional yet modern family home in a peaceful Rajshahi neighborhood.',
    fullDescription: 'This spacious family home in Rajshahi perfectly blends traditional Bangladeshi architecture with modern conveniences. With 4 bedrooms, 3 bathrooms, and a large courtyard, the property offers ample space for multi-generational living. The home features tiled floors, wooden doors and windows, and a modern kitchen. The front garden has mango and lychee trees. Located in a quiet residential area near the Padma River.',
    propertyType: 'villa',
    price: 28000000,
    priceType: 'total',
    location: { city: 'Rajshahi', area: 'Sador' },
    bedrooms: 4,
    bathrooms: 3,
    area: 3000,
    amenities: ['Garden', 'Courtyard', 'Parking', 'Security', 'Water Supply', 'Generator'],
    images: [
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
      'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800',
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800',
    ],
    isFeatured: false,
  },
  {
    title: 'Budget Apartment in Rajshahi City',
    shortDescription: 'Affordable apartment near Rajshahi University.',
    fullDescription: 'This affordable 1-bedroom apartment is ideally located near Rajshahi University, making it perfect for students, faculty, or young professionals. The unit features a bedroom, living room, kitchen, and bathroom with modern fixtures. The building offers 24/7 water supply and backup electricity. Close to public transport, markets, and the famous Padma River ghat.',
    propertyType: 'apartment',
    price: 12000,
    priceType: 'monthly',
    location: { city: 'Rajshahi', area: 'University Area' },
    bedrooms: 1,
    bathrooms: 1,
    area: 700,
    amenities: ['Water Supply', 'Generator', 'Security'],
    images: [
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
      'https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=800',
    ],
    isFeatured: false,
  },
  {
    title: 'Agricultural Land in Rajshahi',
    shortDescription: 'Fertile agricultural land ideal for farming or investment.',
    fullDescription: 'This 50-bigha parcel of fertile agricultural land in Rajshahi is ideal for farming or long-term investment. The land has excellent soil quality suitable for growing rice, mangoes, and other crops. It has direct road access and is connected to irrigation channels. Located just 15km from the city center, the land also has development potential as Rajshahi expands.',
    propertyType: 'land',
    price: 30000000,
    priceType: 'total',
    location: { city: 'Rajshahi', area: 'Puthia' },
    area: 360000,
    amenities: ['Road Access', 'Irrigation', 'Electricity', 'Fertile Soil'],
    images: [
      'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800',
      'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=800',
    ],
    isFeatured: false,
  },

  // ---- MORE DHAKA PROPERTIES ----
  {
    title: 'Penthouse in Banani DOHS',
    shortDescription: 'Exclusive penthouse with private terrace in secure DOHS area.',
    fullDescription: 'Experience the pinnacle of luxury living in this exclusive penthouse located in the prestigious Banani DOHS area. This 4-bedroom penthouse spans the entire top floor and features a private rooftop terrace with 360-degree views of Dhaka. The interior boasts imported marble flooring, a designer kitchen with Miele appliances, and floor-to-ceiling windows throughout. Each bedroom has an en-suite bathroom and built-in wardrobes. The DOHS area provides maximum security with controlled access.',
    propertyType: 'apartment',
    price: 150000,
    priceType: 'monthly',
    location: { city: 'Dhaka', area: 'Banani DOHS' },
    bedrooms: 4,
    bathrooms: 4,
    area: 3500,
    amenities: ['Terrace', 'AC', 'Parking', 'Security', 'Gym', 'Elevator', 'Generator', 'CCTV', 'Concierge'],
    images: [
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
      'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800',
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
    ],
    isFeatured: true,
  },
  {
    title: 'Office Space in Gulshan-2',
    shortDescription: 'Modern co-working office space in a prime business location.',
    fullDescription: 'This modern office space in Gulshan-2 is designed for today\'s dynamic businesses. The open-plan layout features dedicated zones for focused work, collaboration areas, meeting pods, and a fully equipped pantry. High-speed internet, ergonomic furniture, and professional lighting are included. The building offers ample parking, 24/7 access, and is surrounded by restaurants and cafes. Perfect for tech startups, creative agencies, or satellite offices.',
    propertyType: 'commercial',
    price: 95000,
    priceType: 'monthly',
    location: { city: 'Dhaka', area: 'Gulshan-2' },
    area: 2500,
    amenities: ['AC', 'Parking', 'Elevator', 'Security', 'Fiber Internet', 'Pantry', 'Meeting Rooms'],
    images: [
      'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
      'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800',
      'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800',
    ],
    isFeatured: false,
  },
  {
    title: 'Duplex Apartment in Mohammadpur',
    shortDescription: 'Spacious duplex apartment with modern amenities.',
    fullDescription: 'This spacious duplex apartment in Mohammadpur offers excellent value for families needing extra space. The ground floor features a large living and dining area, kitchen, and a guest bathroom. The upper floor has 3 bedrooms including a master suite with walk-in closet and en-suite bathroom, plus 2 additional bedrooms sharing a bathroom. The property includes a small private garden and parking for 2 cars. Located in a well-developed area with schools, mosques, and markets nearby.',
    propertyType: 'apartment',
    price: 42000,
    priceType: 'monthly',
    location: { city: 'Dhaka', area: 'Mohammadpur' },
    bedrooms: 3,
    bathrooms: 3,
    area: 2400,
    amenities: ['AC', 'Garden', 'Parking', 'Security', 'Generator', 'Water Supply'],
    images: [
      'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=800',
      'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=800',
      'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800',
    ],
    isFeatured: false,
  },
  {
    title: 'Commercial Shop in New Market Area',
    shortDescription: 'High-footfall retail shop near Dhaka\'s iconic New Market.',
    fullDescription: 'This ground-floor retail shop is located in one of Dhaka\'s busiest commercial areas near New Market. With excellent foot traffic and visibility, this 500 sqft shop is ideal for retail businesses, showrooms, or food outlets. The space features a glass front, storage room at the back, and access to shared parking. Surrounded by established businesses and easily accessible by public transport.',
    propertyType: 'commercial',
    price: 80000,
    priceType: 'monthly',
    location: { city: 'Dhaka', area: 'New Market' },
    area: 500,
    amenities: ['Parking', 'Security', 'Storage', 'High Foot Traffic'],
    images: [
      'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800',
      'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800',
      'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800',
    ],
    isFeatured: false,
  },
  {
    title: 'Serviced Apartment in Baridhara',
    shortDescription: 'Fully furnished serviced apartment near the diplomatic zone.',
    fullDescription: 'This fully furnished serviced apartment in Baridhara offers hotel-like living with the comfort of home. Located near the diplomatic zone, the 2-bedroom apartment comes with premium furniture, kitchen appliances, weekly housekeeping, and 24/7 concierge service. Residents also have access to a swimming pool, gym, and restaurant. Ideal for expatriates, corporate executives, or anyone seeking a hassle-free living experience.',
    propertyType: 'apartment',
    price: 75000,
    priceType: 'monthly',
    location: { city: 'Dhaka', area: 'Baridhara' },
    bedrooms: 2,
    bathrooms: 2,
    area: 1500,
    amenities: ['Furnished', 'AC', 'Swimming Pool', 'Gym', 'Restaurant', 'Concierge', 'Security', 'Housekeeping'],
    images: [
      'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=800',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
    ],
    isFeatured: false,
  },
];

// Reviews will be populated after users and properties are created
const reviewTemplates = [
  // Reviews from User 1 (demo@homenest.com) - agent reviewing own listings isn't realistic,
  // so let's have John review properties
  { rating: 5, comment: 'Absolutely stunning property! The views from the penthouse are breathtaking. Every detail has been thoughtfully designed. The location in Banani DOHS provides excellent security and convenience. Highly recommended for anyone looking for premium living.' },
  { rating: 4, comment: 'Great apartment in Gulshan. The open-concept living area is wonderful for entertaining. Only minor issue is the parking can get crowded during peak hours. Otherwise, a fantastic property.' },
  { rating: 5, comment: 'The sea-view apartment in Chattogram exceeded all our expectations. Waking up to the Bay of Bengal every morning is a dream come true. The building amenities are top-notch.' },
  { rating: 4, comment: 'Beautiful villa in Dhanmondi with excellent space for a large family. The garden is well-maintained and the pool is perfect for summer. Kitchen appliances could be more modern, but overall a great property.' },
  { rating: 5, comment: 'This hill-view villa in Sylhet is a hidden gem! The tea garden views are mesmerizing, especially during sunrise. The property is well-built and the garden is beautifully landscaped.' },
  { rating: 3, comment: 'The budget apartment in Rajshahi is decent for the price. Close to the university which is convenient. The building could use some maintenance work, but the apartment itself is clean and functional.' },
  { rating: 4, comment: 'Modern apartment in Sylhet city with all necessary amenities. The location near Zindabazar is very convenient. The rooftop terrace is a nice bonus for evening relaxation.' },
  { rating: 5, comment: 'The luxury villa in Dhanmondi is simply magnificent! Five bedrooms, a pool, and a beautiful garden - what more could you ask for? The location is prime and the property is well-maintained. Worth every taka.' },
  { rating: 4, comment: 'The duplex in Mohammadpur offers great value. Spacious rooms, nice garden, and good parking. The neighborhood is peaceful and has all daily necessities nearby. Recommended for families.' },
  { rating: 3, comment: 'The studio apartment in Banani is cozy and well-furnished. Perfect for a single professional. The building amenities are decent. Only wish it had a bit more natural light.' },
  { rating: 5, comment: 'The commercial space in Motijheel is excellent for our business. Central location, good facilities, and the building management is responsive. Highly recommended for businesses looking for a prestigious address.' },
  { rating: 4, comment: 'Family home in Rajshahi is charming and well-maintained. The courtyard is a lovely feature and the mango trees are a bonus! Great for families who appreciate a blend of traditional and modern living.' },
];

async function seed() {
  console.log('🌱 Starting HomeNest database seed...\n');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(DB_NAME);

    // Drop existing collections for clean seed
    console.log('🗑️  Dropping existing collections...');
    await db.collection('users').drop().catch(() => {});
    await db.collection('properties').drop().catch(() => {});
    await db.collection('reviews').drop().catch(() => {});
    await db.collection('contactMessages').drop().catch(() => {});
    console.log('✅ Collections dropped\n');

    // Create indexes
    console.log('📋 Creating indexes...');
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('properties').createIndex({ postedBy: 1 });
    await db.collection('properties').createIndex({ 'location.city': 1 });
    await db.collection('properties').createIndex({ propertyType: 1 });
    await db.collection('properties').createIndex({ isFeatured: 1 });
    await db.collection('properties').createIndex({ rating: -1 });
    await db.collection('properties').createIndex({ createdAt: -1 });
    await db.collection('reviews').createIndex({ propertyId: 1 });
    await db.collection('reviews').createIndex({ userId: 1 });
    await db.collection('reviews').createIndex({ propertyId: 1, userId: 1 }, { unique: true });
    console.log('✅ Indexes created\n');

    // Seed Users
    console.log('👥 Seeding users...');
    const now = new Date().toISOString();
    const seededUsers: any[] = [];

    for (const user of users) {
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(user.password, salt);

      const result = await db.collection('users').insertOne({
        name: user.name,
        email: user.email,
        password: hashedPassword,
        role: user.role,
        avatar: user.avatar || '',
        phone: user.phone || '',
        isBanned: false,
        createdAt: now,
        updatedAt: now,
      });

      seededUsers.push({
        ...user,
        _id: result.insertedId,
      });

      console.log(`   ✅ User: ${user.email} (${user.role})`);
    }
    console.log(`   Total: ${seededUsers.length} users\n`);

    // Seed Properties
    console.log('🏠 Seeding properties...');
    const seededProperties: any[] = [];
    const agentId = seededUsers[1]._id; // demo@homenest.com is the agent (index 1, admin is 0)

    for (const prop of properties) {
      const result = await db.collection('properties').insertOne({
        ...prop,
        rating: 0,
        reviewCount: 0,
        views: Math.floor(Math.random() * 500) + 50,
        status: 'approved',
        postedBy: agentId,
        createdAt: now,
        updatedAt: now,
      });

      seededProperties.push({
        ...prop,
        _id: result.insertedId,
      });
    }

    console.log(`   Total: ${seededProperties.length} properties`);
    console.log(`   Featured: ${properties.filter(p => p.isFeatured).length} properties`);
    console.log(`   Cities: ${[...new Set(properties.map(p => p.location.city))].join(', ')}\n`);

    // Seed Reviews
    console.log('⭐ Seeding reviews...');
    const johnId = seededUsers[1]._id; // john@example.com reviews properties
    const rahimId = seededUsers[0]._id; // demo@homenest.com also reviews

    // John reviews various properties
    const johnReviewIndices = [0, 1, 6, 10, 4, 15, 11, 3, 18, 17]; // property indices
    let reviewCount = 0;

    for (let i = 0; i < Math.min(johnReviewIndices.length, reviewTemplates.length); i++) {
      const propIdx = johnReviewIndices[i];
      const prop = seededProperties[propIdx];
      if (!prop) continue;

      await db.collection('reviews').insertOne({
        propertyId: prop._id,
        userId: johnId,
        userName: 'John Doe',
        rating: reviewTemplates[i].rating,
        comment: reviewTemplates[i].comment,
        createdAt: now,
      });
      reviewCount++;
    }

    // Rahim reviews some properties too
    const rahimReviews = [
      { propIdx: 2, rating: 4, comment: 'My listing in Banani is a great find for young professionals. The location is superb and the apartment is well-maintained.' },
      { propIdx: 7, rating: 5, comment: 'The commercial building in Agrabad is a solid investment. The location in Chittagong\'s business hub ensures high demand.' },
      { propIdx: 5, rating: 4, comment: 'Purbachal plots are excellent long-term investments. The infrastructure is developing rapidly and property values are appreciating.' },
      { propIdx: 13, rating: 4, comment: 'Sreemangal land near the tea gardens is a dream location. Perfect for building a vacation retreat.' },
      { propIdx: 8, rating: 4, comment: 'The family home on CDA Avenue is well-priced for the area. Great for families looking for a peaceful yet connected neighborhood.' },
    ];

    for (const review of rahimReviews) {
      const prop = seededProperties[review.propIdx];
      if (!prop) continue;

      await db.collection('reviews').insertOne({
        propertyId: prop._id,
        userId: rahimId,
        userName: 'Rahim Ahmed',
        rating: review.rating,
        comment: review.comment,
        createdAt: now,
      });
      reviewCount++;
    }

    console.log(`   Total: ${reviewCount} reviews\n`);

    // Calculate and update property ratings based on reviews
    console.log('📊 Updating property ratings...');
    const allReviews = await db.collection('reviews').find({}).toArray();

    // Group reviews by propertyId
    const reviewsByProperty: Record<string, any[]> = {};
    for (const review of allReviews) {
      const propId = review.propertyId.toString();
      if (!reviewsByProperty[propId]) {
        reviewsByProperty[propId] = [];
      }
      reviewsByProperty[propId].push(review);
    }

    let updatedCount = 0;
    for (const [propId, reviews] of Object.entries(reviewsByProperty)) {
      const totalRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0);
      const avgRating = Math.round((totalRating / reviews.length) * 10) / 10;

      await db.collection('properties').updateOne(
        { _id: new ObjectId(propId) },
        {
          $set: {
            rating: avgRating,
            reviewCount: reviews.length,
            updatedAt: now,
          },
        }
      );
      updatedCount++;
    }
    console.log(`   Updated: ${updatedCount} properties with ratings\n`);

    // Final Summary
    const totalProperties = await db.collection('properties').countDocuments();
    const totalUsers = await db.collection('users').countDocuments();
    const totalReviews = await db.collection('reviews').countDocuments();
    const cities = await db.collection('properties').distinct('location.city');

    console.log('═══════════════════════════════════════════');
    console.log('          🏡 HomeNest Seed Complete!       ');
    console.log('═══════════════════════════════════════════');
    console.log(`   👥 Users:          ${totalUsers}`);
    console.log(`   🏠 Properties:     ${totalProperties}`);
    console.log(`   ⭐ Reviews:        ${totalReviews}`);
    console.log(`   🏙️  Cities:         ${cities.join(', ')}`);
    console.log('═══════════════════════════════════════════');
    console.log('\n   Demo Accounts:');
    console.log('   ─────────────────');
    console.log('   Agent: demo@homenest.com / password123');
    console.log('   User:  john@example.com   / password123');
    console.log('═══════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('👋 Database connection closed.');
  }
}

seed();