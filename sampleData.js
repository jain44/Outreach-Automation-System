// Clean initial state (no sample leads)
const INITIAL_LEADS = [];

const DEFAULT_TEMPLATES = [
  {
    id: "tpl_marketing",
    name: "1. Digital Marketing Agencies",
    categoryMatch: "Digital Marketing Agency",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hi {{contact_name}},

I came across {{business_name}} and had a quick question.

Does your team spend hours compiling client reports and tracking leads across multiple platforms instead of focusing on campaign performance and growth?

I build custom client dashboards and workflow automation tools for agencies. Would it make sense to have a 10-minute call?

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_dental",
    name: "2. Dental & Healthcare Clinics",
    categoryMatch: "Dental & Healthcare Clinic",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hi Dr. {contactPerson}, I came across {businessName}. Quick question: how many patients a month miss appointments or never return for their follow-up sitting?

I built a WhatsApp tool for dental clinics that automatically reminds patients, follows up on pending treatments and payments, and brings back patients due for scaling or check-ups.

I also build custom tools around each clinic's workflow, so if you have a different problem, I'm happy to help with that too.


– Jainam Jain
In partnership with SocioKraft (sociokraft.in)`
  },
  {
    id: "tpl_realestate",
    name: "3. Real Estate & Property Consultants",
    categoryMatch: "Real Estate & Property",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hi {{contact_name}},

I came across {{business_name}} and had a quick question.

Does your team lose buyers because inquiry follow-ups happen too late — with leads from 99acres, MagicBricks, or Instagram going cold before you can respond?

I build automated lead response and site visit scheduling tools for real estate businesses. Would it make sense to have a 10-minute call?

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_restaurant",
    name: "4. Restaurants, Cafes & Cloud Kitchens",
    categoryMatch: "Restaurant & Hospitality",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hello {{contact_name}},

I came across {{business_name}} and had a quick question.

Does your restaurant pay 25–30% commission on every Swiggy or Zomato order with no direct way to reach your own customers for repeat business?

I build commission-free direct WhatsApp ordering and customer retention tools for restaurants. Would it make sense to have a 10-minute call?

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_fitness",
    name: "5. Gyms, Fitness & Yoga Studios",
    categoryMatch: "Gym & Fitness Studio",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hi {{contact_name}},

I came across {{business_name}} and had a quick question.

Does your studio lose members quietly each month because there's no automated follow-up when a membership expires or a member goes inactive?

I build automated renewal reminders and member re-engagement tools for fitness studios. Would it make sense to have a 10-minute call?

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_salon",
    name: "6. Salons, Spas & Aesthetic Studios",
    categoryMatch: "Salon & Beauty Spa",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hello {{contact_name}},

I came across {{business_name}} and had a quick question.

Does your salon deal with last-minute cancellations and empty weekday slots with no automated way to fill gaps or bring back clients who haven't returned in a while?

I build WhatsApp appointment booking bots and automated client follow-up tools for salons. Would it make sense to have a 10-minute call?

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_tuition",
    name: "7. Coaching Institutes & Academies",
    categoryMatch: "Coaching & Education",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hello {{contact_name}},

I came across {{business_name}} and had a quick question.

Does your team manually manage student enquiries, admission follow-ups, attendance, and fee records across different tools or spreadsheets?

I build custom institute management tools and automated WhatsApp parent communication systems. Would it make sense to have a 10-minute call?

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_wholesale",
    name: "8. Wholesalers & Distributors",
    categoryMatch: "Wholesale & Distribution",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hi {{contact_name}},

I came across {{business_name}} and had a quick question.

Does your team spend hours updating order records, preparing quotations, or maintaining inventory data manually?

I build structured B2B order portals and automated dispatch notification systems for wholesalers and distributors. Would it make sense to have a 10-minute call?

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_ca_legal",
    name: "9. Chartered Accountants & Legal Consultancies",
    categoryMatch: "CA & Legal Services",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hello {{contact_name}},

I came across {{business_name}} and had a quick question.

Does your team spend days chasing clients for documents — bank statements, invoices, GST data — especially as filing deadlines approach?

I build automated document collection bots and client deadline reminder systems for CA and legal firms. Would it make sense to have a 10-minute call?

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_automobile",
    name: "10. Automobile Garages & Car Care",
    categoryMatch: "Automobile & Detailing",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hi {{contact_name}},

I came across {{business_name}} and had a quick question.

Does your centre lose repeat customers simply because there's no system to remind car owners when their next service, oil change, or tyre rotation is due?

I build automated WhatsApp service reminder systems and digital job cards for automobile service centres. Would it make sense to have a 10-minute call?

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_recruitment",
    name: "11. Recruitment & Staffing Agencies",
    categoryMatch: "Recruitment & Staffing",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hi {{contact_name}},

I came across {{business_name}} and had a quick question.

Does your team lose valuable time tracking candidates, coordinating interviews, and following up across multiple job openings?

I build custom candidate pipeline trackers and automated interview scheduling tools for staffing firms. Would it make sense to have a 10-minute call?

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_manufacturing",
    name: "12. Manufacturing & Industrial Units",
    categoryMatch: "Manufacturing & Industrial",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hello {{contact_name}},

I came across {{business_name}} and had a quick question.

Does your team rely on manual spreadsheets for production tracking, order updates, and operational reporting?

I build custom production tracking dashboards and automated workflow tools for manufacturers. Would it make sense to have a 10-minute call?

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_ecommerce",
    name: "13. E-commerce & Retail Brands",
    categoryMatch: "E-commerce & Retail",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hi {{contact_name}},

I came across {{business_name}} and had a quick question.

Does your team spend too much time managing order updates, inventory records, and repetitive customer enquiries across different platforms?

I build automated order management and customer support tools for e-commerce businesses. Would it make sense to have a 10-minute call?

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_universal",
    name: "14. Universal (Any Other Business)",
    categoryMatch: "Other",
    channel: "whatsapp",
    subject: "Quick question for {{business_name}}",
    body: `Hi {{contact_name}},

I came across {{business_name}} and had a quick question.

Does your team spend time on repetitive manual tasks — follow-ups, reminders, reporting, or data entry — that could be automated to free up time for actual business work?

I build custom software and automation tools tailored to each business. Would it make sense to have a 10-minute call?

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_email_interior",
    name: "15. Premium Interior Design Studios (Email)",
    categoryMatch: "Interior Design & Architecture",
    channel: "email",
    subject: "Custom Software Solutions for {{business_name}}",
    body: `Hello {{Owner_Name}},

Managing multiple interior design projects, tracking client requirements, coordinating with vendors, monitoring project progress, and keeping clients updated can become time-consuming as your studio grows.

We build custom software solutions, including project management dashboards, automated client follow-ups, quotation management systems, and vendor coordination tools tailored specifically for interior design studios.

If your studio faces other operational challenges, we can also build a personalized software or AI automation solution to fit your workflow.

Let's connect to discuss how we could help {{Business_Name}} simplify project management and streamline daily operations.

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_email_aesthetic_clinic",
    name: "16. Aesthetic, Skin & Hair Clinics (Email)",
    categoryMatch: "Dental & Healthcare Clinic",
    channel: "email",
    subject: "Custom Automation Solutions for {{clinic_name}}",
    body: `Hello Dr. {{Doctor_Name}},

Managing appointment enquiries, patient follow-ups, consultation reminders, treatment schedules, and repeat-visit coordination can take significant staff time.

We build custom software and AI automation solutions for clinics, including automated appointment reminders, enquiry management systems, patient follow-up workflows, and dashboards to simplify daily operations.

If your clinic faces other administrative or operational challenges, we can develop a personalized solution tailored to your practice.

Let's connect to discuss how we could help {{Clinic_Name}} streamline patient coordination and reduce repetitive administrative work.

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  },
  {
    id: "tpl_email_realestate",
    name: "17. Real Estate Consultants & Property Brokers (Email)",
    categoryMatch: "Real Estate & Property",
    channel: "email",
    subject: "Lead Management & Automation for {{business_name}}",
    body: `Hello {{Owner_Name}},

Managing property enquiries, qualifying potential buyers, following up with interested clients, tracking site visits, and keeping property details organized can become difficult when everything is handled manually.

We build custom software and AI automation solutions for real estate businesses, including lead management systems, automated follow-up workflows, property enquiry tracking, and sales pipeline dashboards.

If your business faces other operational challenges, we can also develop a personalized solution tailored to your processes and business goals.

Let's connect to discuss how we could help {{Business_Name}} manage leads more efficiently and simplify its daily operations.

Jainam Jain
7977963474
jainamjain1116@gmail.com`
  }
];
