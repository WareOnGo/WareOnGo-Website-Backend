import prisma from '../models/prismaClient.js';

export async function getCareers(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    const row = await prisma.careersPage.findUnique({ where: { slug: 'careers' }, select: { publishedContent: true } });
    const page = row?.publishedContent;
    if (!page) return res.status(200).json({ data: null });
    // An explicit public shape also excludes private fields added by future editors.
    return res.status(200).json({ data: {
      slug: 'careers', seoTitle: page.seoTitle, description: page.description,
      title: page.title, intro: page.intro,
      cultureTitle: page.cultureTitle, cultureDescription: page.cultureDescription,
      applicationEmail: page.applicationEmail,
      interestTitle: page.interestTitle, interestDescription: page.interestDescription,
      interestSubmitLabel: page.interestSubmitLabel, interestSuccessMessage: page.interestSuccessMessage,
      roles: page.roles.filter(role => role.isOpen === true).map(role => ({
        id: role.id, title: role.title, department: role.department, summary: role.summary,
        location: role.location, employmentType: role.employmentType, applyUrl: role.applyUrl, isOpen: true,
        duration: role.duration ?? '', compensation: role.compensation ?? '',
      })),
    } });
  } catch {
    console.error('[careers] public content read failed');
    return res.status(500).json({ error: 'Could not load careers content.' });
  }
}
